import { z } from "zod";
import { BOOKING_SOURCES, BOOKING_STATUSES } from "../enums";

export const createBookingSchema = z.object({
  roomId: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isCorporateRate: z.boolean().default(false),
  /** Lock in the pricing agent's current suggested rate instead of the host's static base rate. */
  useAiSuggestedRate: z.boolean().default(false),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const bookingPublicSchema = z.object({
  id: z.string(),
  travellerId: z.string(),
  roomId: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  /** Agreed room price before the platform fee (hours × rate). */
  subtotalAmount: z.number(),
  /** Total platform commission on this booking (1% of subtotal, split). */
  platformFee: z.number(),
  /** Amount remitted to the supplier: subtotal − their half of the fee. */
  supplierPayout: z.number(),
  /** Amount the traveller is charged: subtotal + their half of the fee. */
  totalAmount: z.number(),
  currency: z.string(),
  isCorporateRate: z.boolean(),
  source: z.enum(BOOKING_SOURCES),
  isAgentAccepted: z.boolean(),
  status: z.enum(BOOKING_STATUSES),
  clientSecret: z.string().nullable().optional(),
});
export type BookingPublic = z.infer<typeof bookingPublicSchema>;
