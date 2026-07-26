import type { FastifyInstance } from "fastify";
import verificationRoutes from "./routes";

export default async function verificationModule(app: FastifyInstance) {
  app.register(verificationRoutes, { prefix: "/verification" });
}
