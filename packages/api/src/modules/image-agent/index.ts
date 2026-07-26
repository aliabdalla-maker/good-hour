import type { FastifyInstance } from "fastify";
import imageAgentRoutes from "./routes";

export default async function imageAgentModule(app: FastifyInstance) {
  app.register(imageAgentRoutes, { prefix: "/image-agent" });
}
