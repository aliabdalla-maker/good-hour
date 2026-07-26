import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  createPropertySchema,
  createRoomSchema,
  roomPublicSchema,
  propertyWithRoomsSchema,
} from "@gihtcx/shared";
import {
  createProperty,
  createRoom,
  getRoomById,
  listPropertiesForSupplier,
  listPublicCatalog,
  toPublicProperty,
  toPublicRoom,
} from "./service";
import { getRoomRatings } from "../reviews";

export default async function listingsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/properties",
    {
      preHandler: [app.authenticate, app.requireRole(["SUPPLIER", "ADMIN"])],
      schema: { body: createPropertySchema, response: { 201: propertyWithRoomsSchema } },
    },
    async (request, reply) => {
      const property = await createProperty(request.currentUser!.sub, request.body);
      return reply.status(201).send({ ...toPublicProperty(property), rooms: [] });
    }
  );

  server.get(
    "/properties",
    {
      preHandler: [app.authenticate, app.requireRole(["SUPPLIER", "ADMIN"])],
      schema: { response: { 200: z.array(propertyWithRoomsSchema) } },
    },
    async (request, reply) => {
      const properties = await listPropertiesForSupplier(request.currentUser!.sub);
      const ratings = await getRoomRatings(properties.flatMap((p) => p.rooms.map((r) => r.id)));
      return reply.send(
        properties.map((property) => ({
          ...toPublicProperty(property),
          rooms: property.rooms.map((r) => toPublicRoom(r, ratings.get(r.id))),
        }))
      );
    }
  );

  server.post(
    "/rooms",
    {
      preHandler: [app.authenticate, app.requireRole(["SUPPLIER", "ADMIN"])],
      schema: { body: createRoomSchema, response: { 201: roomPublicSchema } },
    },
    async (request, reply) => {
      const room = await createRoom(request.currentUser!.sub, request.body);
      return reply.status(201).send(toPublicRoom(room));
    }
  );

  // Public "browse all" catalogue — every property with its active rooms,
  // no auth and no time/availability filter.
  server.get(
    "/catalog",
    { schema: { response: { 200: z.array(propertyWithRoomsSchema) } } },
    async (_request, reply) => {
      const properties = await listPublicCatalog();
      const ratings = await getRoomRatings(properties.flatMap((p) => p.rooms.map((r) => r.id)));
      return reply.send(
        properties.map((property) => ({
          ...toPublicProperty(property),
          rooms: property.rooms.map((r) => toPublicRoom(r, ratings.get(r.id))),
        }))
      );
    }
  );

  server.get(
    "/rooms/:roomId",
    { schema: { params: z.object({ roomId: z.string() }), response: { 200: roomPublicSchema } } },
    async (request, reply) => {
      const room = await getRoomById(request.params.roomId);
      const ratings = await getRoomRatings([room.id]);
      return reply.send({
        ...toPublicRoom(room, ratings.get(room.id)),
        property: toPublicProperty(room.property),
      });
    }
  );
}
