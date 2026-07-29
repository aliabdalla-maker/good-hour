import type { FastifyInstance } from "fastify";
import marketplaceRoutes from "./routes";

export default async function marketplaceModule(app: FastifyInstance) {
  app.register(marketplaceRoutes, { prefix: "/market" });
}

// placeOrder is exported for the integration suite, which drives the real
// concurrency paths through the same entry point the routes use.
export {
  placeOrder,
  settleOrder,
  markOrderFailed,
  refundOrder,
  getMarketplaceStats,
  searchListings,
  getListing,
  createListing,
} from "./service";
