import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { assistantChatSchema, assistantReplySchema } from "@gihtcx/shared";
import { config } from "../../config";
import { verifySession } from "../auth";
import { chatWithAssistant } from "./service";

/**
 * Best-effort session resolution: never throws. The assistant is public (an
 * anonymous visitor can chat), but if a valid session cookie IS present we
 * pass the userId through so the model can offer personalized tools
 * (get_my_bookings) — an invalid/missing cookie just means fewer tools, not
 * an error.
 */
async function tryGetUserId(request: { cookies: Record<string, string | undefined> }): Promise<string | null> {
  const token = request.cookies[config.COOKIE_NAME];
  if (!token) return null;
  try {
    return (await verifySession(token)).sub;
  } catch {
    return null;
  }
}

export default async function assistantRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // Public: the concierge helps anyone, logged in or not.
  server.post(
    "/chat",
    { schema: { body: assistantChatSchema, response: { 200: assistantReplySchema } } },
    async (request, reply) => {
      const userId = await tryGetUserId(request);
      return reply.send(await chatWithAssistant(request.body, userId));
    }
  );
}
