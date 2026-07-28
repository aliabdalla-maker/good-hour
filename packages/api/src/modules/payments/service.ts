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

/**
 * Returns a usable clientSecret for a booking that still needs paying.
 *
 * Checkout previously depended entirely on a clientSecret stashed in
 * sessionStorage by the room page. Close the tab, reload in a new one, or come
 * back later and it was gone — leaving a real PENDING_PAYMENT booking with no
 * route to pay it, which then silently expired. This makes checkout recoverable
 * from the booking id alone.
 *
 * Payment.bookingId is unique, so an existing row must be REUSED (retrieve the
 * intent from Stripe) rather than creating a second one.
 */
export async function getOrCreatePaymentIntent(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) throw new AppError(404, "Booking not found", "NOT_FOUND");
  if (booking.status !== "PENDING_PAYMENT") {
    throw new AppError(409, "This booking is not awaiting payment", "NOT_PAYABLE");
  }

  const cashDue = Number(booking.totalAmount) - Number(booking.creditValueApplied);
  if (cashDue <= 0) {
    throw new AppError(409, "This booking is fully covered by time credits", "NOTHING_TO_PAY");
  }

  const existing = await prisma.payment.findUnique({ where: { bookingId } });

  if (!featureFlags.paymentsEnabled) {
    if (!existing) {
      await createPaymentIntentForBooking(bookingId, cashDue, booking.currency);
    }
    return { clientSecret: null as string | null, simulated: true, amount: cashDue };
  }

  if (existing) {
    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.retrieve(existing.stripePaymentIntentId);
    // A cancelled or already-captured intent can't be reused; the caller should
    // not be shown a card form that will fail.
    if (intent.status === "canceled" || intent.status === "succeeded") {
      throw new AppError(
        409,
        "That payment can no longer be completed — please start a new booking",
        "INTENT_UNUSABLE"
      );
    }
    return { clientSecret: intent.client_secret, simulated: false, amount: cashDue };
  }

  const created = await createPaymentIntentForBooking(bookingId, cashDue, booking.currency);
  return { clientSecret: created.clientSecret, simulated: created.simulated, amount: cashDue };
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
