import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createBookingSchema, bookingPublicSchema, receiptViewSchema, supplierEarningsSchema } from "@gihtcx/shared";
import { cancelBooking, createDirectBooking, getBookingForViewer, getReceipt, getSupplierEarnings, listBookingsForTraveller, toPublicBooking } from "./service";

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

  // Supplier's earnings + bookings across their rooms. Static path is matched
  // before the "/:bookingId" param route by Fastify's router.
  server.get(
    "/supplier",
    {
      preHandler: [app.authenticate, app.requireRole(["SUPPLIER", "ADMIN"])],
      schema: { response: { 200: supplierEarningsSchema } },
    },
    async (request, reply) => reply.send(await getSupplierEarnings(request.currentUser!.sub))
  );

  server.get(
    "/:bookingId",
    {
      preHandler: [app.authenticate],
      schema: { params: z.object({ bookingId: z.string() }), response: { 200: bookingPublicSchema } },
    },
    async (request, reply) => {
      // A session alone is not authorization. Without this, any registered
      // account could read any booking's financials by id — the sibling
      // /receipt and /cancel routes always checked ownership; this one didn't.
      const booking = await getBookingForViewer(request.params.bookingId, request.currentUser!.sub);
      return reply.send(toPublicBooking(booking));
    }
  );

  server.get(
    "/:bookingId/receipt",
    {
      preHandler: [app.authenticate],
      schema: { params: z.object({ bookingId: z.string() }), response: { 200: receiptViewSchema } },
    },
    async (request, reply) => {
      const receipt = await getReceipt(
        request.currentUser!.sub,
        request.currentUser!.role,
        request.params.bookingId
      );
      return reply.send(receipt);
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
