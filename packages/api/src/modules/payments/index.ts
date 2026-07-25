import type { FastifyInstance } from "fastify";
import paymentsRoutes from "./routes";

export default async function paymentsModule(app: FastifyInstance) {
  app.register(paymentsRoutes, { prefix: "/payments" });
}

export { createPaymentIntentForBooking, refundBookingPayment } from "./service";
