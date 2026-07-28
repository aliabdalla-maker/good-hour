import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  creditPurchaseQuoteSchema,
  creditWalletSchema,
  exchangeCreditsSchema,
  exchangeQuoteQuerySchema,
  exchangeQuoteSchema,
  purchaseCreditsSchema,
  transferCreditsSchema,
} from "@gihtcx/shared";
import {
  exchangeCredits,
  getExchangeQuote,
  getWallet,
  startCreditPurchase,
  transferCredits,
} from "./service";

export default async function creditRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/wallet",
    { preHandler: [app.authenticate], schema: { response: { 200: creditWalletSchema } } },
    async (request, reply) => reply.send(await getWallet(request.currentUser!.sub))
  );

  server.post(
    "/purchase",
    {
      preHandler: [app.authenticate],
      schema: { body: purchaseCreditsSchema, response: { 201: creditPurchaseQuoteSchema } },
    },
    async (request, reply) =>
      reply.status(201).send(await startCreditPurchase(request.currentUser!.sub, request.body))
  );

  server.post(
    "/transfer",
    {
      preHandler: [app.authenticate],
      schema: {
        body: transferCreditsSchema,
        response: {
          200: z.object({
            correlationId: z.string(),
            toEmail: z.string(),
            hours: z.number(),
            category: z.string(),
          }),
        },
      },
    },
    async (request, reply) => reply.send(await transferCredits(request.currentUser!.sub, request.body))
  );

  server.get(
    "/exchange-quote",
    {
      preHandler: [app.authenticate],
      schema: { querystring: exchangeQuoteQuerySchema, response: { 200: exchangeQuoteSchema } },
    },
    async (request, reply) => {
      const { fromCategory, toCategory, hours } = request.query;
      return reply.send(await getExchangeQuote(fromCategory, toCategory, hours));
    }
  );

  server.post(
    "/exchange",
    {
      preHandler: [app.authenticate],
      schema: {
        body: exchangeCreditsSchema,
        response: { 200: z.object({ quote: exchangeQuoteSchema, correlationId: z.string() }) },
      },
    },
    async (request, reply) => reply.send(await exchangeCredits(request.currentUser!.sub, request.body))
  );
}
