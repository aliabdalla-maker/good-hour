import { z } from "zod";
import { BOOKING_SOURCES, BOOKING_STATUSES, LISTING_CATEGORIES } from "../enums";

export const receiptViewSchema = z.object({
  bookingId: z.string(),
  status: z.enum(BOOKING_STATUSES),
  itemName: z.string(),
  category: z.enum(LISTING_CATEGORIES),
  hostName: z.string(),
  city: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  hours: z.number(),
  currency: z.string(),
  subtotal: z.number(),
  travellerFee: z.number(),
  total: z.number(),
  issuedAt: z.string(),
});
export type ReceiptView = z.infer<typeof receiptViewSchema>;

export const supplierBookingSchema = z.object({
  id: z.string(),
  itemName: z.string(),
  status: z.enum(BOOKING_STATUSES),
  startsAt: z.string(),
  endsAt: z.string(),
  currency: z.string(),
  payout: z.number(),
});
export const supplierEarningsSchema = z.object({
  currency: z.string(),
  totalEarned: z.number(),
  confirmedCount: z.number(),
  bookings: z.array(supplierBookingSchema),
});
export type SupplierEarnings = z.infer<typeof supplierEarningsSchema>;

export const createBookingSchema = z.object({
  roomId: z.string(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isCorporateRate: z.boolean().default(false),
  /** Lock in the pricing agent's current suggested rate instead of the host's static base rate. */
  useAiSuggestedRate: z.boolean().default(false),
  /**
   * Time credits to spend on this booking, reducing the cash payable. Must be
   * credits of the listing's own category and can't exceed the booked hours —
   * a credit buys an hour, it isn't a general-purpose discount.
   */
  redeemCreditHours: z.number().min(0).max(10_000).default(0),
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
  /**
   * GROSS amount owed: subtotal + the buyer-side fee. Time credits do NOT
   * reduce this — they reduce the cash charged. Checkout must show
   * `totalAmount − creditValueApplied` as the amount due, or the card total
   * won't match the figure above it.
   */
  totalAmount: z.number(),
  /** Money value covered by redeemed time credits (0 when none were used). */
  creditValueApplied: z.number().default(0),
  currency: z.string(),
  isCorporateRate: z.boolean(),
  source: z.enum(BOOKING_SOURCES),
  isAgentAccepted: z.boolean(),
  status: z.enum(BOOKING_STATUSES),
  clientSecret: z.string().nullable().optional(),
});
export type BookingPublic = z.infer<typeof bookingPublicSchema>;
