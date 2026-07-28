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
import {
  createListing,
  getListing,
  listMyListings,
  listMyOrders,
  placeOrder,
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
