import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  submitVerificationSchema,
  verificationDecisionSchema,
  verificationStatusSchema,
  pendingSupplierSchema,
} from "@gihtcx/shared";
import {
  submitVerification,
  getVerificationStatus,
  listPendingSuppliers,
  decideVerification,
} from "./service";

export default async function verificationRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/submit",
    {
      preHandler: [app.authenticate, app.requireRole(["SUPPLIER", "ADMIN"])],
      schema: { body: submitVerificationSchema, response: { 200: verificationStatusSchema } },
    },
    async (request, reply) => reply.send(await submitVerification(request.currentUser!.sub, request.body))
  );

  server.get(
    "/me",
    {
      preHandler: [app.authenticate, app.requireRole(["SUPPLIER", "ADMIN"])],
      schema: { response: { 200: verificationStatusSchema } },
    },
    async (request, reply) => reply.send(await getVerificationStatus(request.currentUser!.sub))
  );

  // Admin review queue.
  server.get(
    "/pending",
    {
      preHandler: [app.authenticate, app.requireRole(["ADMIN"])],
      schema: { response: { 200: z.array(pendingSupplierSchema) } },
    },
    async (_request, reply) => reply.send(await listPendingSuppliers())
  );

  server.post(
    "/:userId/decision",
    {
      preHandler: [app.authenticate, app.requireRole(["ADMIN"])],
      schema: {
        params: z.object({ userId: z.string() }),
        body: verificationDecisionSchema,
        response: { 200: verificationStatusSchema },
      },
    },
    async (request, reply) => reply.send(await decideVerification(request.params.userId, request.body))
  );
}
