import Stripe from "stripe";
import { config } from "../../config";

let client: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!config.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!client) {
    client = new Stripe(config.STRIPE_SECRET_KEY);
  }
  return client;
}
