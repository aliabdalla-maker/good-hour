import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  createBookingRequestSchema,
  bookingRequestPublicSchema,
  createSupplierOfferSchema,
  supplierOfferPublicSchema,
} from "@gihtcx/shared";
import { bookingPublicSchema } from "@gihtcx/shared";
import type { BookingRequestStatus, SupplierOfferStatus } from "@gihtcx/shared";
import {
  acceptOffer,
  createBookingRequest,
  getBookingRequestById,
  listOffersForBookingRequest,
  submitSupplierOffer,
} from "./service";
import { toPublicBooking } from "../booking";

function toPublicBookingRequest(br: {
  id: string;
  travellerId: string;
  category: string;
  locationQuery: string;
  desiredStart: Date;
  desiredEnd: Date;
  requiredAmenities: string[];
  maxBudget: unknown;
  autoAcceptEnabled: boolean;
  status: BookingRequestStatus;
  expiresAt: Date;
}) {
  return {
    id: br.id,
    travellerId: br.travellerId,
    category: br.category,
    locationQuery: br.locationQuery,
    desiredStart: br.desiredStart.toISOString(),
    desiredEnd: br.desiredEnd.toISOString(),
    requiredAmenities: br.requiredAmenities,
    maxBudget: br.maxBudget === null ? null : Number(br.maxBudget),
    autoAcceptEnabled: br.autoAcceptEnabled,
    status: br.status,
    expiresAt: br.expiresAt.toISOString(),
  };
}

function toPublicOffer(offer: {
  id: string;
  bookingRequestId: string;
  supplierId: string;
  roomId: string;
  offeredRate: unknown;
  offeredTotal: unknown;
  message: string | null;
  isAgentSubmitted: boolean;
  status: SupplierOfferStatus;
  submittedAt: Date;
}) {
  return {
    id: offer.id,
    bookingRequestId: offer.bookingRequestId,
    supplierId: offer.supplierId,
    roomId: offer.roomId,
    offeredRate: Number(offer.offeredRate),
    offeredTotal: Number(offer.offeredTotal),
    message: offer.message,
    isAgentSubmitted: offer.isAgentSubmitted,
    status: offer.status,
    submittedAt: offer.submittedAt.toISOString(),
  };
}

export default async function biddingRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/requests",
    {
      preHandler: [app.authenticate, app.requireRole(["TRAVELLER", "ADMIN"])],
      schema: { body: createBookingRequestSchema, response: { 201: bookingRequestPublicSchema } },
    },
    async (request, reply) => {
      const bookingRequest = await createBookingRequest(request.currentUser!.sub, request.body);
      return reply.status(201).send(toPublicBookingRequest(bookingRequest));
    }
  );

  server.get(
    "/requests/:requestId",
    {
      // Was unauthenticated: exposed the traveller's maxBudget and
      // autoAcceptEnabled to anyone holding a request id.
      preHandler: [app.authenticate],
      schema: { params: z.object({ requestId: z.string() }), response: { 200: bookingRequestPublicSchema } },
    },
    async (request, reply) => {
      const bookingRequest = await getBookingRequestById(request.params.requestId);
      return reply.send(toPublicBookingRequest(bookingRequest));
    }
  );

  server.get(
    "/requests/:requestId/offers",
    {
      // Was unauthenticated: a supplier could read every rival's offeredTotal
      // and undercut it by a penny, which destroys the auction's integrity.
      preHandler: [app.authenticate],
      schema: { params: z.object({ requestId: z.string() }), response: { 200: z.array(supplierOfferPublicSchema) } },
    },
    async (request, reply) => {
      const offers = await listOffersForBookingRequest(request.params.requestId);
      return reply.send(offers.map(toPublicOffer));
    }
  );

  server.post(
    "/offers",
    {
      preHandler: [app.authenticate, app.requireRole(["SUPPLIER", "ADMIN"])],
      schema: { body: createSupplierOfferSchema, response: { 201: supplierOfferPublicSchema } },
    },
    async (request, reply) => {
      const offer = await submitSupplierOffer(request.currentUser!.sub, request.body);
      return reply.status(201).send(toPublicOffer(offer));
    }
  );

  server.post(
    "/offers/:offerId/accept",
    {
      preHandler: [app.authenticate, app.requireRole(["TRAVELLER", "ADMIN"])],
      schema: { params: z.object({ offerId: z.string() }), response: { 201: bookingPublicSchema } },
    },
    async (request, reply) => {
      const { booking, clientSecret } = await acceptOffer(request.currentUser!.sub, request.params.offerId, false);
      return reply.status(201).send(toPublicBooking(booking, clientSecret));
    }
  );
}
