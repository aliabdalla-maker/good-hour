import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { searchQuerySchema, searchResultSchema } from "@gihtcx/shared";
import { z } from "zod";
import { searchRooms } from "./service";

export default async function searchRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/",
    {
      schema: {
        querystring: searchQuerySchema,
        response: { 200: z.array(searchResultSchema) },
      },
    },
    async (request, reply) => {
      const results = await searchRooms(request.query);
      return reply.send(results);
    }
  );
}
