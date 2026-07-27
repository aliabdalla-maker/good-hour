import { Worker } from "bullmq";
import { prisma } from "@gihtcx/db";
import type { NegotiationAgentInput } from "@gihtcx/shared";
import { redisConnection } from "../../../api/src/queue/connection";
import { QUEUE_NAMES } from "../../../api/src/queue/queues";
import type { OfferEvaluationJobData } from "../../../api/src/queue/jobs/types";
import { evaluateOffers } from "../../../api/src/modules/negotiation-agent/service";
import {
  markRecommendedOffer,
  maybeAutoAccept,
  expireBookingRequestIfStillOpen,
} from "../../../api/src/modules/bidding/service";
import { getSupplierRatingAvg } from "../../../api/src/modules/reviews";

async function buildNegotiationInput(bookingRequestId: string): Promise<NegotiationAgentInput | null> {
  const bookingRequest = await prisma.bookingRequest.findUnique({ where: { id: bookingRequestId } });
  if (!bookingRequest || bookingRequest.status !== "OPEN") return null;

  const offers = await prisma.supplierOffer.findMany({
    where: { bookingRequestId, status: { in: ["PENDING", "RECOMMENDED"] } },
    include: { room: true },
  });
  if (offers.length === 0) return null;

  const offerInputs = await Promise.all(
    offers.map(async (offer) => {
      // roomDistanceKm is still null -- it needs geocoding locationQuery, which
      // isn't implemented. supplierRatingAvg IS wired now, from real reviews.
      const [supplierCompletedBookings, supplierRatingAvg] = await Promise.all([
        prisma.booking.count({
          where: { status: "COMPLETED", room: { property: { supplierId: offer.supplierId } } },
        }),
        getSupplierRatingAvg(offer.supplierId),
      ]);

      return {
        offerId: offer.id,
        supplierId: offer.supplierId,
        roomId: offer.roomId,
        offeredRate: Number(offer.offeredRate),
        offeredTotal: Number(offer.offeredTotal),
        roomAmenities: offer.room.amenities,
        roomDistanceKm: null,
        supplierRatingAvg,
        supplierCompletedBookings,
      };
    })
  );

  return {
    bookingRequest: {
      id: bookingRequest.id,
      desiredStart: bookingRequest.desiredStart.toISOString(),
      desiredEnd: bookingRequest.desiredEnd.toISOString(),
      requiredAmenities: bookingRequest.requiredAmenities,
      maxBudget: bookingRequest.maxBudget ? Number(bookingRequest.maxBudget) : null,
      locationQuery: bookingRequest.locationQuery,
    },
    offers: offerInputs,
    policy: { weighting: "balanced" },
  };
}

export function startOfferEvaluationWorker() {
  return new Worker<OfferEvaluationJobData>(
    QUEUE_NAMES.offerEvaluation,
    async (job) => {
      const input = await buildNegotiationInput(job.data.bookingRequestId);
      if (input) {
        const decision = await evaluateOffers(input, { bookingRequestId: job.data.bookingRequestId });
        await markRecommendedOffer(job.data.bookingRequestId, decision.recommendedOfferId);
        await maybeAutoAccept(job.data.bookingRequestId, decision.recommendedOfferId);
      }

      // Runs after the re-evaluate + auto-accept attempt above, so it only
      // ever closes a request that's genuinely still undecided at its deadline.
      if (job.data.reason === "expiry_approaching") {
        await expireBookingRequestIfStillOpen(job.data.bookingRequestId);
      }
    },
    { connection: redisConnection }
  );
}
