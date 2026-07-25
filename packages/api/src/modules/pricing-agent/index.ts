import type { FastifyInstance } from "fastify";
import pricingAgentRoutes from "./routes";

export default async function pricingAgentModule(app: FastifyInstance) {
  app.register(pricingAgentRoutes, { prefix: "/pricing" });
}

export { recommendRate, getSuggestedRateForRoom } from "./service";
