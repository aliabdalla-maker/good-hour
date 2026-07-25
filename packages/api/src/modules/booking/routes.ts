import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createBookingSchema, bookingPublicSchema } from "@gihtcx/shared";
import { cancelBooking, createDirectBooking, getBookingById, listBookingsForTraveller, toPublicBooking } from "./service";

export default async function bookingRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/",
    {
      preHandler: [app.authenticate],
      schema: { response: { 200: z.array(bookingPublicSchema) } },
    },
    async (request, reply) => {
      const bookings = await listBookingsForTraveller(request.currentUser!.sub);
      return reply.send(bookings.map((b) => toPublicBooking(b)));
    }
  );

  server.post(
    "/",
    {
      preHandler: [app.authenticate, app.requireRole(["TRAVELLER", "ADMIN"])],
      schema: { body: createBookingSchema, response: { 201: bookingPublicSchema } },
    },
    async (request, reply) => {
      const { booking, clientSecret } = await createDirectBooking(request.currentUser!.sub, request.body);
      return reply.status(201).send(toPublicBooking(booking, clientSecret));
    }
  );

  server.get(
    "/:bookingId",
    {
      preHandler: [app.authenticate],
      schema: { params: z.object({ bookingId: z.string() }), response: { 200: bookingPublicSchema } },
    },
    async (request, reply) => {
      const booking = await getBookingById(request.params.bookingId);
      return reply.send(toPublicBooking(booking));
    }
  );

  server.post(
    "/:bookingId/cancel",
    {
      preHandler: [app.authenticate],
      schema: { params: z.object({ bookingId: z.string() }) },
    },
    async (request, reply) => {
      await cancelBooking(request.params.bookingId, request.currentUser!.sub);
      return reply.status(204).send();
    }
  );
}
