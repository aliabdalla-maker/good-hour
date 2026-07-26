import type { FastifyInstance } from "fastify";
import assistantRoutes from "./routes";

export default async function assistantModule(app: FastifyInstance) {
  app.register(assistantRoutes, { prefix: "/assistant" });
}
