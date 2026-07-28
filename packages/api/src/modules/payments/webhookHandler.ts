import type Stripe from "stripe";
import { config } from "../../config";
import { getStripeClient } from "./stripeClient";
import { markPaymentFailed, markPaymentSucceeded } from "./service";
import { grantPurchasedCredits, markCreditPurchaseFailed } from "../credits";
import { creditTopUp, markTopUpFailed } from "../wallet";
import { markOrderFailed, settleOrder } from "../marketplace";
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
    default:
      break;
  }
}
