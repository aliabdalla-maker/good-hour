import type { FastifyInstance } from "fastify";
import crmRoutes from "./routes";

export default async function crmModule(app: FastifyInstance) {
  app.register(crmRoutes, { prefix: "/crm" });
}
