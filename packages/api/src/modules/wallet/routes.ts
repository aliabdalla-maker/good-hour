import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ERP_ADMIN_EMAIL,
  moneyWalletSchema,
  topUpWalletSchema,
  walletTopUpQuoteSchema,
} from "@gihtcx/shared";
import { getMoneyWallet, startTopUp } from "./service";
import {
  cancelPayout,
  listMyPayouts,
  listPendingPayouts,
  markPayoutFailed,
  markPayoutPaid,
  requestPayout,
} from "./payouts";

export default async function walletRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/",
    { preHandler: [app.authenticate], schema: { response: { 200: moneyWalletSchema } } },
    async (request, reply) => reply.send(await getMoneyWallet(request.currentUser!.sub))
  );

  server.post(
    "/topup",
    {
      preHandler: [app.authenticate],
      schema: { body: topUpWalletSchema, response: { 201: walletTopUpQuoteSchema } },
    },
    async (request, reply) =>
      reply.status(201).send(await startTopUp(request.currentUser!.sub, request.body))
  );

  // --- Payouts -------------------------------------------------------------
  // Sellers could accrue proceeds with no way to withdraw them. Only the MANUAL
  // method exists: the operator sends the money and marks it paid.

  server.get(
    "/payouts",
    { preHandler: [app.authenticate] },
    async (request, reply) => reply.send(await listMyPayouts(request.currentUser!.sub))
  );

  server.post(
    "/payouts",
    {
      preHandler: [app.authenticate],
      schema: {
        body: z.object({
          amount: z.number().positive(),
          // Free text on purpose. The operator reads it; storing structured bank
          // details would make this table a far more attractive target.
          destinationNote: z.string().trim().max(500).optional(),
        }),
      },
    },
    async (request, reply) =>
      reply.status(201).send(await requestPayout(request.currentUser!.sub, request.body))
  );

  server.post(
    "/payouts/:id/cancel",
    { preHandler: [app.authenticate], schema: { params: z.object({ id: z.string() }) } },
    async (request, reply) =>
      reply.send(await cancelPayout(request.currentUser!.sub, request.params.id))
  );

  // Operator queue. Restricted to the single owner-operator account, same as the ERP
  // console — paying money out is the most consequential action in the product.
  server.get(
    "/payouts/pending",
    { preHandler: [app.authenticate, app.requireEmail([ERP_ADMIN_EMAIL])] },
    async (_request, reply) => reply.send(await listPendingPayouts())
  );

  server.post(
    "/payouts/:id/paid",
    {
      preHandler: [app.authenticate, app.requireEmail([ERP_ADMIN_EMAIL])],
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({ operatorNote: z.string().trim().max(500).optional() }),
      },
    },
    async (request, reply) =>
      reply.send(
        await markPayoutPaid(request.params.id, request.currentUser!.sub, request.body.operatorNote)
      )
  );

  server.post(
    "/payouts/:id/failed",
    {
      preHandler: [app.authenticate, app.requireEmail([ERP_ADMIN_EMAIL])],
      schema: {
        params: z.object({ id: z.string() }),
        // Required, not optional: a failure the seller cannot understand is worse
        // than the failure itself, and their money is going back either way.
        body: z.object({ operatorNote: z.string().trim().min(5).max(500) }),
      },
    },
    async (request, reply) =>
      reply.send(
        await markPayoutFailed(request.params.id, request.currentUser!.sub, request.body.operatorNote)
      )
  );
}
