import type Stripe from "stripe";
import { prisma } from "@gihtcx/db";
import { config } from "../../config";
import { getStripeClient } from "./stripeClient";
import { markPaymentFailed, markPaymentSucceeded } from "./service";
import { grantPurchasedCredits, markCreditPurchaseFailed } from "../credits";
import { creditTopUp, markTopUpFailed } from "../wallet";
import { markOrderFailed, refundOrder, settleOrder } from "../marketplace";
import { AppError } from "../../plugins/errorHandler";

export function constructWebhookEvent(rawBody: Buffer, signature: string): Stripe.Event {
  if (!config.STRIPE_WEBHOOK_SECRET) {
    throw new AppError(500, "STRIPE_WEBHOOK_SECRET is not configured", "CONFIG_ERROR");
  }
  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
}

export async function handleWebhookEvent(event: Stripe.Event) {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      // Two different things pay through Stripe now: bookings and time-credit
      // top-ups. The metadata key set at intent-creation time is what tells
      // them apart — without this branch a credit purchase would be looked up
      // in the Payment table, miss, and throw a 404 that Stripe would then
      // retry forever.
      if (intent.metadata?.creditPurchaseId) {
        await grantPurchasedCredits(intent.metadata.creditPurchaseId);
        break;
      }
      if (intent.metadata?.walletTopUpId) {
        await creditTopUp(intent.metadata.walletTopUpId);
        break;
      }
      if (intent.metadata?.marketplaceOrderId) {
        await settleOrder(intent.metadata.marketplaceOrderId);
        break;
      }
      await markPaymentSucceeded(intent.id);
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      if (intent.metadata?.creditPurchaseId) {
        await markCreditPurchaseFailed(intent.metadata.creditPurchaseId);
        break;
      }
      if (intent.metadata?.walletTopUpId) {
        await markTopUpFailed(intent.metadata.walletTopUpId);
        break;
      }
      if (intent.metadata?.marketplaceOrderId) {
        await markOrderFailed(intent.metadata.marketplaceOrderId);
        break;
      }
      await markPaymentFailed(intent.id, intent.last_payment_error?.message ?? "unknown");
      break;
    }
    // A refund or a dispute means the money has left the platform. Before these
    // branches existed they fell into `default: break`, so a chargeback pulled
    // the funds back from us while the seller kept their credited proceeds —
    // a full-order-value loss on every dispute, recorded nowhere.
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const orderId = await orderIdForCharge(charge);
      if (orderId) await refundOrder(orderId, "card_refund");
      break;
    }
    case "charge.dispute.created":
    case "charge.dispute.funds_withdrawn": {
      const dispute = event.data.object as Stripe.Dispute;
      const orderId = await orderIdForPaymentIntent(
        typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id
      );
      // "chargeback": Stripe has already returned the money to the cardholder,
      // so we must NOT also credit the buyer's wallet — only claw the seller back.
      if (orderId) await refundOrder(orderId, "chargeback");
      break;
    }
    default:
      break;
  }
}

async function orderIdForCharge(charge: Stripe.Charge): Promise<string | null> {
  if (charge.metadata?.marketplaceOrderId) return charge.metadata.marketplaceOrderId;
  const intentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  return orderIdForPaymentIntent(intentId);
}

/**
 * Dispute/refund events carry the charge, not our metadata, so the order has to
 * be found by the intent id we stored at creation.
 */
async function orderIdForPaymentIntent(intentId?: string | null): Promise<string | null> {
  if (!intentId) return null;
  const order = await prisma.marketplaceOrder.findUnique({
    where: { stripePaymentIntentId: intentId },
    select: { id: true },
  });
  return order?.id ?? null;
}
