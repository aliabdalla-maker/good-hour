import type { FastifyInstance } from "fastify";
import bookingRoutes from "./routes";

export default async function bookingModule(app: FastifyInstance) {
  app.register(bookingRoutes, { prefix: "/bookings" });
}

export { createDirectBooking, getBookingById, getReceipt, getSupplierEarnings, listBookingsForTraveller, cancelBooking, toPublicBooking, releaseExpiredReservation } from "./service";
export { ensureSlotsGenerated, isRangeFullyOpen } from "./slotService";
export { assertTransitionAllowed } from "./stateMachine";
