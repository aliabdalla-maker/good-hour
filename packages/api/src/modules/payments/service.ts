import { prisma } from "@gihtcx/db";
import { getStripeClient } from "./stripeClient";
import { featureFlags } from "../../config";
import { domainEvents } from "../../events/bus";
import { AppError } from "../../plugins/errorHandler";

/**
 * Creates a Stripe PaymentIntent for a booking and a matching Payment
 * row. If Stripe isn't configured (no test keys yet), returns a
 * simulated intent so the rest of the booking flow remains testable
 * end-to-end without a Stripe account.
 */
export async function createPaymentIntentForBooking(bookingId: string, amount: number, currency: string) {
  if (!featureFlags.paymentsEnabled) {
    const simulatedId = `pi_simulated_${bookingId}`;
    await prisma.payment.create({
      data: {
        bookingId,
        stripePaymentIntentId: simulatedId,
        amount,
        currency,
        status: "requires_payment_method",
      },
    });
    return { clientSecret: null as string | null, simulated: true };
  }

  const stripe = getStripeClient();
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata: { bookingId },
  });

  await prisma.payment.create({
    data: {
      bookingId,
      stripePaymentIntentId: intent.id,
      amount,
      currency,
      status: intent.status,
    },
  });

  return { clientSecret: intent.client_secret, simulated: false };
}

export async function markPaymentSucceeded(stripePaymentIntentId: string) {
  const payment = await prisma.payment.findUnique({ where: { stripePaymentIntentId } });
  if (!payment) {
    throw new AppError(404, "Payment not found for this intent", "NOT_FOUND");
  }

  const booking = await prisma.booking.findUnique({ where: { id: payment.bookingId } });
  if (!booking) {
    throw new AppError(404, "Booking not found for this payment", "NOT_FOUND");
  }

  // Idempotent: a duplicated webhook (Stripe retries) must not re-fire events.
  if (booking.status === "CONFIRMED") return;

  // The reservation already expired/was cancelled before payment landed — the
  // slots are gone, so we must not confirm. Refund instead.
  if (booking.status !== "PENDING_PAYMENT") {
    await refundBookingPayment(booking.id);
    return;
  }

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: "succeeded", capturedAt: new Date() },
    }),
    prisma.booking.update({
      where: { id: payment.bookingId },
      data: { status: "CONFIRMED" },
    }),
    // Promote the held slots to BOOKED now that payment has cleared.
    prisma.availabilitySlot.updateMany({
      where: { bookingId: payment.bookingId },
      data: { status: "BOOKED" },
    }),
  ]);

  await domainEvents.publish({ type: "payment.succeeded", payload: { paymentId: payment.id, bookingId: payment.bookingId } });
  await domainEvents.publish({ type: "booking.confirmed", payload: { bookingId: payment.bookingId } });
}

/**
 * Refunds a booking's payment. Uses Stripe when configured and the intent is
 * real; otherwise (simulated/dev) just marks the Payment refunded so the flow
 * is testable end-to-end. Idempotent.
 */
export async function refundBookingPayment(bookingId: string) {
  const payment = await prisma.payment.findUnique({ where: { bookingId } });
  if (!payment || payment.status === "refunded") return;

  const isReal = featureFlags.paymentsEnabled && !payment.stripePaymentIntentId.startsWith("pi_simulated_");
  let stripeRefundId: string | undefined;
  if (isReal) {
    const stripe = getStripeClient();
    const refund = await stripe.refunds.create({ payment_intent: payment.stripePaymentIntentId });
    stripeRefundId = refund.id;
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "refunded", refundedAt: new Date(), stripeRefundId },
  });
}

export async function markPaymentFailed(stripePaymentIntentId: string, reason: string) {
  const payment = await prisma.payment.findUnique({ where: { stripePaymentIntentId } });
  if (!payment) {
    throw new AppError(404, "Payment not found for this intent", "NOT_FOUND");
  }

  await prisma.payment.update({ where: { id: payment.id }, data: { status: "failed" } });
  await domainEvents.publish({ type: "payment.failed", payload: { bookingId: payment.bookingId, reason } });
}

/** Dev-only helper: lets the demo flow "pay" without a real Stripe account configured. */
export async function simulatePaymentSucceeded(bookingId: string) {
  const payment = await prisma.payment.findUnique({ where: { bookingId } });
  if (!payment) {
    throw new AppError(404, "Payment not found for this booking", "NOT_FOUND");
  }
  await markPaymentSucceeded(payment.stripePaymentIntentId);
}
