import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  auctionDetailSchema,
  auctionPublicSchema,
  auctionSearchQuerySchema,
  createAuctionSchema,
  placeBidSchema,
  AUCTION_TERMS,
  AGENT_MANDATE_TERMS,
  DISPUTE_REASONS,
} from "@gihtcx/shared";
import {
  createAuction,
  getAuctionDetail,
  listMyAuctionActivity,
  placeBid,
  searchAuctions,
  settleAuction,
} from "./service";
import { raiseAuctionDispute, termsAcceptance } from "./compliance";
import { auctionDraftRequestSchema, auctionDraftSchema, draftAuction } from "./matchmaker";

export default async function auctionRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // Browsing auctions needs no account — the live price is the shop window.
  server.get(
    "/",
    { preHandler: [app.optionalAuth], schema: { querystring: auctionSearchQuerySchema, response: { 200: z.array(auctionPublicSchema) } } },
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
    {
      preHandler: [app.optionalAuth],
      schema: { params: z.object({ id: z.string() }), response: { 200: auctionDetailSchema } },
    },
    async (request, reply) =>
      reply.send(await getAuctionDetail(request.params.id, request.currentUser?.sub ?? null))
  );

  // AI auction drafter: one sentence in, a complete auction (priced from
  // comparable listings) out. The user still reviews and opens it themselves.
  server.post(
    "/draft",
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: { body: auctionDraftRequestSchema, response: { 200: auctionDraftSchema } },
    },
    async (request, reply) => reply.send(await draftAuction(request.body))
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

  // CR-003 / CR-004: the terms a bid binds you to, and what this account has
  // already accepted. Public text, private acceptance.
  server.get("/terms", async (_request, reply) =>
    reply.send({ auction: AUCTION_TERMS, agentMandate: AGENT_MANDATE_TERMS })
  );

  server.get(
    "/terms/acceptance",
    { preHandler: [app.authenticate] },
    async (request, reply) => reply.send(await termsAcceptance(request.currentUser!.sub))
  );

  server.post(
    "/:id/dispute",
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({
          reason: z.enum(DISPUTE_REASONS),
          // Long enough to be actionable, bounded so it cannot be used as storage.
          detail: z.string().trim().min(20).max(2000),
        }),
      },
    },
    async (request, reply) =>
      reply.status(201).send(
        await raiseAuctionDispute(request.currentUser!.sub, {
          auctionId: request.params.id,
          reason: request.body.reason,
          detail: request.body.detail,
        })
      )
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
