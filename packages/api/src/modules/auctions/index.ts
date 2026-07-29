import type { FastifyInstance } from "fastify";
import auctionRoutes from "./routes";

export default async function auctionsModule(app: FastifyInstance) {
  app.register(auctionRoutes, { prefix: "/auctions" });
}

export { placeBid, closeAuction, settleAuction, getAuctionStats } from "./service";
