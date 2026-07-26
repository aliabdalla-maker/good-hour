import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createMessageSchema, messagePublicSchema } from "@gihtcx/shared";
import { sendMessage, listMessages } from "./service";

export default async function messagesRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // Either party of the booking can post (membership enforced in the service).
  server.post(
    "/",
    {
      preHandler: [app.authenticate],
      schema: { body: createMessageSchema, response: { 201: messagePublicSchema } },
    },
    async (request, reply) => reply.status(201).send(await sendMessage(request.currentUser!.sub, request.body))
  );

  server.get(
    "/",
    {
      preHandler: [app.authenticate],
      schema: {
        querystring: z.object({ bookingId: z.string() }),
        response: { 200: z.array(messagePublicSchema) },
      },
    },
    async (request, reply) => reply.send(await listMessages(request.currentUser!.sub, request.query.bookingId))
  );
}
