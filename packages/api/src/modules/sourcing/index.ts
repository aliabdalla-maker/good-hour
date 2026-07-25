import type { FastifyInstance } from "fastify";
import sourcingRoutes from "./routes";

export default async function sourcingModule(app: FastifyInstance) {
  app.register(sourcingRoutes, { prefix: "/sourcing" });
}
