import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  createMarketplaceListingSchema,
  createMarketplaceOrderSchema,
  marketplaceListingPublicSchema,
  marketplaceOrderPublicSchema,
  marketplaceSearchQuerySchema,
  marketplaceSearchResultSchema,
} from "@gihtcx/shared";
import { prisma } from "@gihtcx/db";
import { AppError } from "../../plugins/errorHandler";
import {
  createListing,
  getListing,
  listMyListings,
  listMyOrders,
  placeOrder,
  refundOrder,
  searchListings,
} from "./service";

export default async function marketplaceRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  // Public: anyone can search the catalogue without an account.
  server.get(
    "/search",
    { schema: { querystring: marketplaceSearchQuerySchema, response: { 200: marketplaceSearchResultSchema } } },
    async (request, reply) => reply.send(await searchListings(request.query))
  );

  // Declared before "/:id" so "mine" isn't captured as an id.
  server.get(
    "/mine",
    { preHandler: [app.authenticate], schema: { response: { 200: z.array(marketplaceListingPublicSchema) } } },
    async (request, reply) => reply.send(await listMyListings(request.currentUser!.sub))
  );

  server.get(
    "/orders",
    { preHandler: [app.authenticate], schema: { response: { 200: z.array(marketplaceOrderPublicSchema) } } },
    async (request, reply) => reply.send(await listMyOrders(request.currentUser!.sub))
  );

  server.get(
    "/:id",
    { schema: { params: z.object({ id: z.string() }), response: { 200: marketplaceListingPublicSchema } } },
    async (request, reply) => reply.send(await getListing(request.params.id))
  );

  server.post(
    "/",
    {
      preHandler: [app.authenticate],
      schema: { body: createMarketplaceListingSchema, response: { 201: marketplaceListingPublicSchema } },
    },
    async (request, reply) =>
      reply.status(201).send(await createListing(request.currentUser!.sub, request.body))
  );

  // Seller-initiated refund. A chargeback arrives via the Stripe webhook
  // instead; both funnel through the same refundOrder().
  server.post(
    "/orders/:orderId/refund",
    {
      preHandler: [app.authenticate],
      schema: {
        params: z.object({ orderId: z.string() }),
        response: { 200: z.object({ status: z.string() }) },
      },
    },
    async (request, reply) => {
      const order = await prisma.marketplaceOrder.findUnique({
        where: { id: request.params.orderId },
        select: { sellerId: true, paymentMethod: true },
      });
      // 404 rather than 403 so order ids can't be probed for existence.
      if (!order || order.sellerId !== request.currentUser!.sub) {
        throw new AppError(404, "Order not found", "NOT_FOUND");
      }
      await refundOrder(request.params.orderId, order.paymentMethod === "WALLET" ? "wallet" : "card_refund");
      return reply.send({ status: "REFUNDED" });
    }
  );

  server.post(
    "/orders",
    {
      preHandler: [app.authenticate],
      schema: { body: createMarketplaceOrderSchema, response: { 201: marketplaceOrderPublicSchema } },
    },
    async (request, reply) =>
      reply.status(201).send(await placeOrder(request.currentUser!.sub, request.body))
  );
}
