import { z } from "zod";

/** Pricing agent: forced structured output from the pricing-agent OpenAI call. */
export const pricingDecisionSchema = z.object({
  recommendedHourlyRate: z.number().positive(),
  rateMultiplier: z.number().positive(),
  reasoning: z.string().max(300),
  confidence: z.enum(["low", "medium", "high"]),
});
export type PricingDecision = z.infer<typeof pricingDecisionSchema>;

export const pricingAgentInputSchema = z.object({
  roomId: z.string(),
  city: z.string(),
  baseHourlyRate: z.number().positive(),
  currency: z.string(),
  occupancy: z.object({
    currentSlotUtilizationPct: z.number().min(0).max(100),
    next24hUtilizationPct: z.number().min(0).max(100),
  }),
  demandSignals: z.object({
    recentSearchCountForArea24h: z.number().int().min(0),
    recentBookingCountForRoom7d: z.number().int().min(0),
    competitorAvgRateInRadius: z.number().nonnegative().nullable(),
  }),
  timeContext: z.object({
    dayOfWeek: z.string(),
    hourOfDay: z.number().int().min(0).max(23),
    isLocalHoliday: z.boolean(),
  }),
  constraints: z.object({
    minRate: z.number().positive(),
    maxRate: z.number().positive(),
  }),
});
export type PricingAgentInput = z.infer<typeof pricingAgentInputSchema>;

/** Negotiation agent: forced structured output from the negotiation-agent OpenAI call. */
export const matchDecisionSchema = z.object({
  recommendedOfferId: z.string(),
  rankedOfferIds: z.array(z.string()),
  reasoning: z.string().max(500),
  perOfferScore: z.array(
    z.object({
      offerId: z.string(),
      score: z.number().min(0).max(100),
      notes: z.string().max(200),
    })
  ),
});
export type MatchDecision = z.infer<typeof matchDecisionSchema>;

export const negotiationAgentInputSchema = z.object({
  bookingRequest: z.object({
    id: z.string(),
    desiredStart: z.string(),
    desiredEnd: z.string(),
    requiredAmenities: z.array(z.string()),
    maxBudget: z.number().positive().nullable(),
    locationQuery: z.string(),
  }),
  offers: z.array(
    z.object({
      offerId: z.string(),
      supplierId: z.string(),
      roomId: z.string(),
      offeredRate: z.number().positive(),
      offeredTotal: z.number().positive(),
      roomAmenities: z.array(z.string()),
      roomDistanceKm: z.number().nonnegative().nullable(),
      supplierRatingAvg: z.number().min(0).max(5).nullable(),
      supplierCompletedBookings: z.number().int().min(0),
    })
  ),
  policy: z.object({
    weighting: z.enum(["balanced", "price_first", "quality_first"]),
  }),
});
export type NegotiationAgentInput = z.infer<typeof negotiationAgentInputSchema>;
