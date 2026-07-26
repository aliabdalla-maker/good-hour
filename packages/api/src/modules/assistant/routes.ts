import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { assistantChatSchema, assistantReplySchema } from "@gihtcx/shared";
import { chatWithAssistant } from "./service";

export default async function assistantRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // Public: the concierge helps anyone, logged in or not.
  server.post(
    "/chat",
    { schema: { body: assistantChatSchema, response: { 200: assistantReplySchema } } },
    async (request, reply) => reply.send(await chatWithAssistant(request.body))
  );
}
