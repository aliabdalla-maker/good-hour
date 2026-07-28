import type { FastifyInstance } from "fastify";
import marketplaceRoutes from "./routes";

export default async function marketplaceModule(app: FastifyInstance) {
  app.register(marketplaceRoutes, { prefix: "/market" });
}

export { settleOrder, markOrderFailed, getMarketplaceStats } from "./service";
