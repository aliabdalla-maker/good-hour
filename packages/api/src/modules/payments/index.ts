import type { FastifyInstance } from "fastify";
import paymentsRoutes from "./routes";

export default async function paymentsModule(app: FastifyInstance) {
  app.register(paymentsRoutes, { prefix: "/payments" });
}

export { createPaymentIntentForBooking, refundBookingPayment } from "./service";
// Re-exported so credits/marketplace/wallet reach Stripe through this barrel
// rather than deep-importing ./stripeClient. The boundary rule now enforces it.
export { getStripeClient } from "./stripeClient";
