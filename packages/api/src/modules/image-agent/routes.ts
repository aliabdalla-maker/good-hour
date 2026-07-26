import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { generateListingImageSchema, generatedImageSchema } from "@gihtcx/shared";
import { generateListingImage } from "./service";

export default async function imageAgentRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/generate",
    {
      preHandler: [app.authenticate, app.requireRole(["SUPPLIER", "ADMIN"])],
      schema: { body: generateListingImageSchema, response: { 200: generatedImageSchema } },
    },
    async (request, reply) => reply.send(await generateListingImage(request.currentUser!.sub, request.body))
  );
}
