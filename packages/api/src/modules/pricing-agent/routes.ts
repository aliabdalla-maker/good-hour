import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { pricingDecisionSchema } from "@gihtcx/shared";
import { getSuggestedRateForRoom } from "./service";

export default async function pricingAgentRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/rooms/:roomId/suggested-rate",
    { schema: { params: z.object({ roomId: z.string() }), response: { 200: pricingDecisionSchema } } },
    async (request, reply) => {
      const decision = await getSuggestedRateForRoom(request.params.roomId);
      return reply.send(decision);
    }
  );
}
