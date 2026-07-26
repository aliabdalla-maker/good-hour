import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  addCrmNoteSchema,
  crmContactDetailSchema,
  crmNoteSchema,
  crmContactSchema,
  crmSummarySchema,
  updateCrmContactSchema,
} from "@gihtcx/shared";
import { addCrmNote, getCrmContact, getCrmSummary, updateCrmContact } from "./service";

export default async function crmRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const adminOnly = { preHandler: [app.authenticate, app.requireRole(["ADMIN"])] };

  server.get(
    "/contacts",
    { ...adminOnly, schema: { response: { 200: crmSummarySchema } } },
    async (_request, reply) => reply.send(await getCrmSummary())
  );

  server.get(
    "/contacts/:userId",
    { ...adminOnly, schema: { params: z.object({ userId: z.string() }), response: { 200: crmContactDetailSchema } } },
    async (request, reply) => reply.send(await getCrmContact(request.params.userId))
  );

  server.patch(
    "/contacts/:userId",
    {
      ...adminOnly,
      schema: {
        params: z.object({ userId: z.string() }),
        body: updateCrmContactSchema,
        response: { 200: crmContactSchema },
      },
    },
    async (request, reply) => reply.send(await updateCrmContact(request.params.userId, request.body))
  );

  server.post(
    "/contacts/:userId/notes",
    {
      ...adminOnly,
      schema: {
        params: z.object({ userId: z.string() }),
        body: addCrmNoteSchema,
        response: { 201: crmNoteSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await addCrmNote(request.params.userId, request.currentUser!.sub, request.body))
  );
}
