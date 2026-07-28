import type Stripe from "stripe";
import { config } from "../../config";
import { getStripeClient } from "./stripeClient";
import { markPaymentFailed, markPaymentSucceeded } from "./service";
import { grantPurchasedCredits, markCreditPurchaseFailed } from "../credits";
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
      const creditPurchaseId = intent.metadata?.creditPurchaseId;
      if (creditPurchaseId) {
        await grantPurchasedCredits(creditPurchaseId);
        break;
      }
      await markPaymentSucceeded(intent.id);
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      const creditPurchaseId = intent.metadata?.creditPurchaseId;
      if (creditPurchaseId) {
        await markCreditPurchaseFailed(creditPurchaseId);
        break;
      }
      await markPaymentFailed(intent.id, intent.last_payment_error?.message ?? "unknown");
      break;
    }
    default:
      break;
  }
}
