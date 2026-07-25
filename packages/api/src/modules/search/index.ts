import type { FastifyInstance } from "fastify";
import searchRoutes from "./routes";

export default async function searchModule(app: FastifyInstance) {
  app.register(searchRoutes);
}

export { searchRooms } from "./service";
