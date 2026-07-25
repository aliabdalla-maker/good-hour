import type { FastifyInstance } from "fastify";
import biddingRoutes from "./routes";

export default async function biddingModule(app: FastifyInstance) {
  app.register(biddingRoutes, { prefix: "/bidding" });
}

export {
  createBookingRequest,
  submitSupplierOffer,
  listOffersForBookingRequest,
  getBookingRequestById,
  acceptOffer,
  markRecommendedOffer,
  maybeAutoAccept,
} from "./service";
