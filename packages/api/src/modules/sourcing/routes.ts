import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  importUrlSchema,
  importFeedSchema,
  publishDraftSchema,
  sourcedDraftPublicSchema,
  marketRateSchema,
  propertyWithRoomsSchema,
} from "@gihtcx/shared";
import {
  discardDraft,
  getMarketRate,
  importFromFeed,
  importFromSmoobu,
  importFromUrl,
  listDrafts,
  publishDraft,
  toPublicDraft,
} from "./service";
import { toPublicProperty } from "../listings";

export default async function sourcingRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const supplierGuard = { preHandler: [app.authenticate, app.requireRole(["SUPPLIER", "ADMIN"])] };

  server.post(
    "/import-url",
    { ...supplierGuard, schema: { body: importUrlSchema, response: { 201: sourcedDraftPublicSchema } } },
    async (request, reply) => {
      const draft = await importFromUrl(request.currentUser!.sub, request.body.url);
      return reply.status(201).send(toPublicDraft(draft));
    }
  );

  server.post(
    "/import-feed",
    {
      ...supplierGuard,
      schema: {
        body: importFeedSchema,
        response: { 201: z.object({ created: z.number(), drafts: z.array(sourcedDraftPublicSchema) }) },
      },
    },
    async (request, reply) => {
      const drafts = await importFromFeed(request.currentUser!.sub, request.body.items);
      return reply.status(201).send({ created: drafts.length, drafts: drafts.map(toPublicDraft) });
    }
  );

  server.post(
    "/import-smoobu",
    {
      ...supplierGuard,
      schema: { response: { 201: z.object({ created: z.number(), drafts: z.array(sourcedDraftPublicSchema) }) } },
    },
    async (request, reply) => {
      const drafts = await importFromSmoobu(request.currentUser!.sub);
      return reply.status(201).send({ created: drafts.length, drafts: drafts.map(toPublicDraft) });
    }
  );

  server.get(
    "/drafts",
    { ...supplierGuard, schema: { response: { 200: z.array(sourcedDraftPublicSchema) } } },
    async (request, reply) => {
      const drafts = await listDrafts(request.currentUser!.sub);
      return reply.send(drafts.map(toPublicDraft));
    }
  );

  server.post(
    "/drafts/:id/publish",
    {
      ...supplierGuard,
      schema: {
        params: z.object({ id: z.string() }),
        body: publishDraftSchema,
        response: { 201: propertyWithRoomsSchema },
      },
    },
    async (request, reply) => {
      const property = await publishDraft(request.currentUser!.sub, request.params.id, request.body);
      return reply.status(201).send({ ...toPublicProperty(property), rooms: [] });
    }
  );

  server.post(
    "/drafts/:id/discard",
    { ...supplierGuard, schema: { params: z.object({ id: z.string() }) } },
    async (request, reply) => {
      await discardDraft(request.currentUser!.sub, request.params.id);
      return reply.status(204).send();
    }
  );

  server.get(
    "/market-rate",
    {
      preHandler: [app.authenticate],
      schema: { querystring: z.object({ city: z.string().min(1) }), response: { 200: marketRateSchema } },
    },
    async (request, reply) => {
      return reply.send(await getMarketRate(request.query.city));
    }
  );
}
