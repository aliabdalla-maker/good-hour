import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  auctionDetailSchema,
  auctionPublicSchema,
  auctionSearchQuerySchema,
  createAuctionSchema,
  placeBidSchema,
} from "@gihtcx/shared";
import {
  createAuction,
  getAuctionDetail,
  listMyAuctionActivity,
  placeBid,
  searchAuctions,
  settleAuction,
} from "./service";

export default async function auctionRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // Browsing auctions needs no account — the live price is the shop window.
  server.get(
    "/",
    { schema: { querystring: auctionSearchQuerySchema, response: { 200: z.array(auctionPublicSchema) } } },
    async (request, reply) =>
      reply.send(await searchAuctions(request.query, request.currentUser?.sub ?? null))
  );

  // Declared before "/:id" so "mine" isn't captured as an id.
  server.get(
    "/mine",
    {
      preHandler: [app.authenticate],
      schema: {
        response: {
          200: z.object({
            created: z.array(auctionPublicSchema),
            bidding: z.array(auctionPublicSchema),
          }),
        },
      },
    },
    async (request, reply) => reply.send(await listMyAuctionActivity(request.currentUser!.sub))
  );

  server.get(
    "/:id",
    { schema: { params: z.object({ id: z.string() }), response: { 200: auctionDetailSchema } } },
    async (request, reply) =>
      reply.send(await getAuctionDetail(request.params.id, request.currentUser?.sub ?? null))
  );

  server.post(
    "/",
    {
      preHandler: [app.authenticate],
      schema: { body: createAuctionSchema, response: { 201: auctionPublicSchema } },
    },
    async (request, reply) =>
      reply.status(201).send(await createAuction(request.currentUser!.sub, request.body))
  );

  server.post(
    "/:id/bids",
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        body: placeBidSchema,
        response: { 201: auctionDetailSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await placeBid(request.currentUser!.sub, request.params.id, request.body))
  );

  server.post(
    "/:id/settle",
    {
      preHandler: [app.authenticate],
      schema: { params: z.object({ id: z.string() }), response: { 200: auctionDetailSchema } },
    },
    async (request, reply) => {
      await settleAuction(request.params.id, request.currentUser!.sub);
      return reply.send(await getAuctionDetail(request.params.id, request.currentUser!.sub));
    }
  );
}
