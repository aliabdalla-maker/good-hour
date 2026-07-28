import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { moneyWalletSchema, topUpWalletSchema, walletTopUpQuoteSchema } from "@gihtcx/shared";
import { getMoneyWallet, startTopUp } from "./service";

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
}
