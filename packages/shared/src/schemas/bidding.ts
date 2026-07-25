import { z } from "zod";
import { BOOKING_REQUEST_STATUSES, SUPPLIER_OFFER_STATUSES } from "../enums";

export const createBookingRequestSchema = z.object({
  category: z.literal("ROOM").default("ROOM"),
  locationQuery: z.string().min(1).max(200),
  desiredStart: z.string().datetime(),
  desiredEnd: z.string().datetime(),
  requiredAmenities: z.array(z.string()).default([]),
  maxBudget: z.number().positive().nullable().default(null),
  /** A2B: let the traveller's agent auto-accept the top recommendation within maxBudget. */
  autoAcceptEnabled: z.boolean().default(false),
});
export type CreateBookingRequestInput = z.infer<typeof createBookingRequestSchema>;

export const bookingRequestPublicSchema = z.object({
  id: z.string(),
  travellerId: z.string(),
  category: z.string(),
  locationQuery: z.string(),
  desiredStart: z.string(),
  desiredEnd: z.string(),
  requiredAmenities: z.array(z.string()),
  maxBudget: z.number().nullable(),
  autoAcceptEnabled: z.boolean(),
  status: z.enum(BOOKING_REQUEST_STATUSES),
  expiresAt: z.string(),
});
export type BookingRequestPublic = z.infer<typeof bookingRequestPublicSchema>;

export const createSupplierOfferSchema = z.object({
  bookingRequestId: z.string(),
  roomId: z.string(),
  offeredRate: z.number().positive(),
  offeredTotal: z.number().positive(),
  message: z.string().max(500).optional(),
});
export type CreateSupplierOfferInput = z.infer<typeof createSupplierOfferSchema>;

export const supplierOfferPublicSchema = z.object({
  id: z.string(),
  bookingRequestId: z.string(),
  supplierId: z.string(),
  roomId: z.string(),
  offeredRate: z.number(),
  offeredTotal: z.number(),
  message: z.string().nullable(),
  isAgentSubmitted: z.boolean(),
  status: z.enum(SUPPLIER_OFFER_STATUSES),
  submittedAt: z.string(),
});
export type SupplierOfferPublic = z.infer<typeof supplierOfferPublicSchema>;
