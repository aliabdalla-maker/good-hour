import { prisma } from "@gihtcx/db";
import type { CreateBookingRequestInput, CreateSupplierOfferInput } from "@gihtcx/shared";
import { computeFeeBreakdown } from "@gihtcx/shared";
import { config } from "../../config";
import { AppError } from "../../plugins/errorHandler";
import { domainEvents } from "../../events/bus";
import { offerEvaluationQueue, bookingExpiryQueue } from "../../queue/queues";
import { ensureSlotsGenerated, isRangeFullyOpen } from "../booking";
import { createPaymentIntentForBooking } from "../payments";
import { recordAgentOutcome } from "../agent-log";

const MIN_EXPIRY_MINUTES = 15;
const DEFAULT_WINDOW_HOURS = 4;

function computeExpiresAt(desiredStart: Date): Date {
  const now = new Date();
  const defaultWindow = new Date(now.getTime() + DEFAULT_WINDOW_HOURS * 60 * 60 * 1000);
  const minExpiry = new Date(now.getTime() + MIN_EXPIRY_MINUTES * 60 * 1000);
  const candidate = desiredStart < defaultWindow ? desiredStart : defaultWindow;
  return candidate < minExpiry ? minExpiry : candidate;
}

export async function createBookingRequest(travellerId: string, input: CreateBookingRequestInput) {
  const desiredStart = new Date(input.desiredStart);
  const desiredEnd = new Date(input.desiredEnd);

  const bookingRequest = await prisma.bookingRequest.create({
    data: {
      travellerId,
      category: input.category,
      locationQuery: input.locationQuery,
      desiredStart,
      desiredEnd,
      requiredAmenities: input.requiredAmenities,
      maxBudget: input.maxBudget,
      autoAcceptEnabled: input.autoAcceptEnabled,
      expiresAt: computeExpiresAt(desiredStart),
    },
  });

  await generateAutoOffers(bookingRequest.id);

  return bookingRequest;
}

/**
 * B2A: rooms whose supplier enabled autoOfferEnabled respond to a new
 * BookingRequest immediately, without a human filling in the offer form.
 * Matching is a simple city/amenity/capacity fit against the room's
 * static rate -- no LLM call here, the LLM's job is ranking offers
 * (negotiation-agent), not generating them.
 */
async function generateAutoOffers(bookingRequestId: string) {
  const bookingRequest = await prisma.bookingRequest.findUniqueOrThrow({
    where: { id: bookingRequestId },
  });

  const hours = Math.round(
    (bookingRequest.desiredEnd.getTime() - bookingRequest.desiredStart.getTime()) / (60 * 60 * 1000)
  );

  const candidateRooms = await prisma.room.findMany({
    where: {
      status: "ACTIVE",
      autoOfferEnabled: true,
      minHours: { lte: hours },
      maxHours: { gte: hours },
      property: { city: { contains: bookingRequest.locationQuery, mode: "insensitive" } },
    },
    include: { property: true },
  });

  for (const room of candidateRooms) {
    const hasAllAmenities = bookingRequest.requiredAmenities.every((a) => room.amenities.includes(a));
    if (!hasAllAmenities) continue;

    await ensureSlotsGenerated(room.id);
    const available = await isRangeFullyOpen(room.id, bookingRequest.desiredStart, bookingRequest.desiredEnd);
    if (!available) continue;

    const offeredRate = Number(room.baseHourlyRate);
    const offeredTotal = Math.round(offeredRate * hours * 100) / 100;
    if (bookingRequest.maxBudget && offeredTotal > Number(bookingRequest.maxBudget) * 1.25) continue;

    const offer = await prisma.supplierOffer.create({
      data: {
        bookingRequestId,
        supplierId: room.property.supplierId,
        roomId: room.id,
        offeredRate,
        offeredTotal,
        message: "Auto-submitted by supplier agent based on standard room rate.",
        isAgentSubmitted: true,
      },
    });

    await domainEvents.publish({ type: "offer.submitted", payload: { offerId: offer.id, bookingRequestId } });
  }

  await offerEvaluationQueue.add("evaluate", { bookingRequestId, reason: "offer_submitted" });
}

export async function submitSupplierOffer(supplierId: string, input: CreateSupplierOfferInput) {
  const bookingRequest = await prisma.bookingRequest.findUnique({ where: { id: input.bookingRequestId } });
  if (!bookingRequest || bookingRequest.status !== "OPEN") {
    throw new AppError(404, "Booking request is not open for offers", "NOT_FOUND");
  }

  const roomWithProperty = await prisma.room.findUnique({
    where: { id: input.roomId },
    include: { property: true },
  });
  if (!roomWithProperty || roomWithProperty.property.supplierId !== supplierId) {
    throw new AppError(403, "You do not own this room", "FORBIDDEN");
  }

  const offer = await prisma.supplierOffer.create({
    data: {
      bookingRequestId: input.bookingRequestId,
      supplierId,
      roomId: input.roomId,
      offeredRate: input.offeredRate,
      offeredTotal: input.offeredTotal,
      message: input.message,
      isAgentSubmitted: false,
    },
  });

  await domainEvents.publish({ type: "offer.submitted", payload: { offerId: offer.id, bookingRequestId: input.bookingRequestId } });
  await offerEvaluationQueue.add("evaluate", { bookingRequestId: input.bookingRequestId, reason: "offer_submitted" });

  return offer;
}

export async function listOffersForBookingRequest(bookingRequestId: string) {
  return prisma.supplierOffer.findMany({
    where: { bookingRequestId },
    orderBy: { submittedAt: "asc" },
  });
}

/**
 * Closes the audit loop: finds the most recent negotiation-agent decision
 * for this booking request and records whether the offer that actually
 * got accepted was the one the agent recommended.
 */
async function recordNegotiationOutcome(bookingRequestId: string, acceptedOfferId: string) {
  const latestLog = await prisma.agentDecisionLog.findFirst({
    where: { agentType: "NEGOTIATION", subjectType: "BookingRequest", subjectId: bookingRequestId },
    orderBy: { createdAt: "desc" },
  });
  if (!latestLog) return;

  const decision = latestLog.parsedDecision as { recommendedOfferId?: string };
  await recordAgentOutcome(latestLog.id, decision.recommendedOfferId === acceptedOfferId);
}

/** Called by the offer-evaluation worker job once negotiation-agent has ranked the offers. */
export async function markRecommendedOffer(bookingRequestId: string, offerId: string) {
  await prisma.supplierOffer.update({ where: { id: offerId }, data: { status: "RECOMMENDED" } });
  await domainEvents.publish({ type: "match.recommended", payload: { bookingRequestId, offerId } });
}

/**
 * A2B: if the traveller opted into auto-accept, the traveller's agent
 * accepts the negotiation agent's top pick as soon as it's within
 * maxBudget, instead of waiting for a manual click. Still funnels
 * through the same acceptOffer path a human click would use.
 */
export async function maybeAutoAccept(bookingRequestId: string, recommendedOfferId: string) {
  const bookingRequest = await getBookingRequestById(bookingRequestId);
  if (!bookingRequest.autoAcceptEnabled || bookingRequest.status !== "OPEN") return;

  const offer = await prisma.supplierOffer.findUnique({ where: { id: recommendedOfferId } });
  if (!offer) return;
  if (bookingRequest.maxBudget && Number(offer.offeredTotal) > Number(bookingRequest.maxBudget)) return;

  await acceptOffer(bookingRequest.travellerId, recommendedOfferId, true);
}

export async function getBookingRequestById(id: string) {
  const bookingRequest = await prisma.bookingRequest.findUnique({ where: { id } });
  if (!bookingRequest) {
    throw new AppError(404, "Booking request not found", "NOT_FOUND");
  }
  return bookingRequest;
}

/**
 * Accepting an offer (whether by a human click or the traveller's
 * auto-accept agent) funnels through the exact same booking+payment path
 * as a direct search booking -- proof that the extension seam works.
 */
export async function acceptOffer(travellerId: string, offerId: string, isAgentAccepted = false) {
  const offer = await prisma.supplierOffer.findUnique({ where: { id: offerId }, include: { bookingRequest: true, room: true } });
  if (!offer) {
    throw new AppError(404, "Offer not found", "NOT_FOUND");
  }
  if (offer.bookingRequest.travellerId !== travellerId) {
    throw new AppError(403, "You do not own this booking request", "FORBIDDEN");
  }
  if (offer.status === "ACCEPTED") {
    throw new AppError(409, "Offer already accepted", "ALREADY_ACCEPTED");
  }
  if (offer.bookingRequest.status !== "OPEN") {
    throw new AppError(409, "Booking request is no longer open", "REQUEST_CLOSED");
  }

  await ensureSlotsGenerated(offer.roomId);
  const available = await isRangeFullyOpen(offer.roomId, offer.bookingRequest.desiredStart, offer.bookingRequest.desiredEnd);
  if (!available) {
    throw new AppError(409, "The offered room is no longer available for this time range", "SLOT_UNAVAILABLE");
  }

  // The accepted offer's total is the agreed room price; the platform fee is
  // then applied on top exactly as it is for a direct booking.
  const fee = computeFeeBreakdown(Number(offer.offeredTotal));
  const reservationExpiresAt = new Date(Date.now() + config.RESERVATION_HOLD_MINUTES * 60 * 1000);

  const booking = await prisma.$transaction(async (tx) => {
    const claimed = await tx.availabilitySlot.updateMany({
      where: {
        roomId: offer.roomId,
        startsAt: { gte: offer.bookingRequest.desiredStart, lt: offer.bookingRequest.desiredEnd },
        status: "OPEN",
      },
      data: { status: "HELD" },
    });
    const hours = Math.round(
      (offer.bookingRequest.desiredEnd.getTime() - offer.bookingRequest.desiredStart.getTime()) / (60 * 60 * 1000)
    );
    if (claimed.count !== hours) {
      throw new AppError(409, "Slots were claimed by another booking, please retry", "SLOT_CONFLICT");
    }

    const created = await tx.booking.create({
      data: {
        travellerId,
        roomId: offer.roomId,
        startsAt: offer.bookingRequest.desiredStart,
        endsAt: offer.bookingRequest.desiredEnd,
        subtotalAmount: fee.subtotal,
        platformFee: fee.platformFee,
        supplierPayout: fee.supplierPayout,
        totalAmount: fee.travellerTotal,
        currency: offer.room.currency,
        source: "REVERSE_BID",
        sourceOfferId: offer.id,
        isAgentAccepted,
        status: "PENDING_PAYMENT",
        reservationExpiresAt,
      },
    });

    // Slots stay HELD until payment succeeds.
    await tx.availabilitySlot.updateMany({
      where: {
        roomId: offer.roomId,
        startsAt: { gte: offer.bookingRequest.desiredStart, lt: offer.bookingRequest.desiredEnd },
      },
      data: { bookingId: created.id },
    });

    await tx.supplierOffer.update({ where: { id: offer.id }, data: { status: "ACCEPTED" } });
    await tx.supplierOffer.updateMany({
      where: { bookingRequestId: offer.bookingRequestId, id: { not: offer.id } },
      data: { status: "REJECTED" },
    });
    await tx.bookingRequest.update({ where: { id: offer.bookingRequestId }, data: { status: "MATCHED" } });

    return created;
  });

  await bookingExpiryQueue.add(
    "expire",
    { bookingId: booking.id },
    {
      delay: config.RESERVATION_HOLD_MINUTES * 60 * 1000,
      jobId: `booking-expiry-${booking.id}`,
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  const { clientSecret } = await createPaymentIntentForBooking(booking.id, fee.travellerTotal, booking.currency);

  await domainEvents.publish({ type: "booking.created", payload: { bookingId: booking.id, travellerId } });

  await recordNegotiationOutcome(offer.bookingRequestId, offer.id);

  return { booking, clientSecret };
}
