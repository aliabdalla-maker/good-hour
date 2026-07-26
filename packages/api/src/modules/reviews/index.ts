import type { FastifyInstance } from "fastify";
import reviewsRoutes from "./routes";

export default async function reviewsModule(app: FastifyInstance) {
  app.register(reviewsRoutes, { prefix: "/reviews" });
}

export { getRoomRatings, getSupplierRatingAvg, listReviewsForRoom } from "./service";
