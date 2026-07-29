import type { FastifyInstance } from "fastify";
import listingsRoutes from "./routes";

export default async function listingsModule(app: FastifyInstance) {
  app.register(listingsRoutes, { prefix: "/listings" });
}

export { getRoomById, toPublicRoom, toPublicProperty, createProperty, createRoom } from "./service";
