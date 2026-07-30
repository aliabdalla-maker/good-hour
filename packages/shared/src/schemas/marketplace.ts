import { z } from "zod";

export const MARKETPLACE_KINDS = ["PRODUCT", "SERVICE"] as const;
export type MarketplaceKind = (typeof MARKETPLACE_KINDS)[number];

export const PRICING_UNITS = [
  "FIXED",
  "HOURLY",
  "HALF_DAY",
  "DAY",
  "PROJECT",
  "SUBSCRIPTION_MONTH",
] as const;
export type PricingUnit = (typeof PRICING_UNITS)[number];

/** Human labels, shared so the API and UI never disagree on wording. */
export const PRICING_UNIT_LABELS: Record<PricingUnit, string> = {
  FIXED: "each",
  HOURLY: "per hour",
  HALF_DAY: "per half day",
  DAY: "per day",
  PROJECT: "per project",
  SUBSCRIPTION_MONTH: "per month",
};

export const MARKETPLACE_LISTING_STATUSES = ["ACTIVE", "PAUSED", "SOLD_OUT"] as const;
export const MARKETPLACE_ORDER_STATUSES = ["PENDING_PAYMENT", "PAID", "CANCELLED", "REFUNDED"] as const;
export const ORDER_PAYMENT_METHODS = ["WALLET", "CARD"] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];

// --- listings ---

export const createMarketplaceListingSchema = z.object({
  kind: z.enum(MARKETPLACE_KINDS),
  title: z.string().min(3).max(140),
  description: z.string().min(10).max(4000),
  category: z.string().min(2).max(60),
  price: z.number().positive().max(1_000_000),
  pricingUnit: z.enum(PRICING_UNITS).default("FIXED"),
  // Same 5MB-ish ceiling the room imageUrl uses, so a data: URI photo fits.
  imageUrl: z.string().max(4_000_000).optional(),
  /** Null/absent = unmetered, which is normal for a service. */
  stock: z.number().int().min(0).max(1_000_000).nullable().optional(),
});
export type CreateMarketplaceListingInput = z.infer<typeof createMarketplaceListingSchema>;

export const marketplaceListingPublicSchema = z.object({
  id: z.string(),
  sellerId: z.string(),
  /**
   * Non-identifying display handle, NOT the seller's email.
   *
   * /market/search and /market/:id are unauthenticated, so returning the real
   * address let anyone iterate the catalogue and harvest every seller's email
   * for phishing. Buyers who need to reach a seller do so through an order.
   */
  sellerHandle: z.string(),
  sellerVerified: z.boolean(),
  kind: z.enum(MARKETPLACE_KINDS),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  price: z.number(),
  pricingUnit: z.enum(PRICING_UNITS),
  currency: z.string(),
  imageUrl: z.string().nullable(),
  stock: z.number().int().nullable(),
  status: z.enum(MARKETPLACE_LISTING_STATUSES),
  /**
   * Whether an OPEN auction currently references this listing.
   *
   * Server-side because the client cannot know it, and it is what makes the trading-
   * model badges mean something: without it every marketplace card would advertise
   * "fixed price" alone, which is exactly the information gap the badges exist to
   * close. Derived per request, never stored — a stored flag would keep advertising an
   * auction after it closed.
   */
  hasOpenAuction: z.boolean(),
  /** Presentation-layer domain inferred from `category`; null when nothing matches. */
  domain: z.string().nullable(),
  createdAt: z.string(),
});
export type MarketplaceListingPublic = z.infer<typeof marketplaceListingPublicSchema>;

/** Querystring — every value arrives as a string, hence the coercions. */
export const marketplaceSearchQuerySchema = z.object({
  q: z.string().max(140).optional(),
  kind: z.enum(MARKETPLACE_KINDS).optional(),
  category: z.string().max(60).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort: z.enum(["newest", "price_asc", "price_desc"]).default("newest"),
});
export type MarketplaceSearchQuery = z.infer<typeof marketplaceSearchQuerySchema>;

export const marketplaceSearchResultSchema = z.object({
  listings: z.array(marketplaceListingPublicSchema),
  total: z.number().int(),
  /** Distinct categories present in the live catalogue, for filter chips. */
  categories: z.array(z.string()),
});
export type MarketplaceSearchResult = z.infer<typeof marketplaceSearchResultSchema>;

// --- orders ---

export const createMarketplaceOrderSchema = z.object({
  listingId: z.string(),
  quantity: z.number().int().min(1).max(1000).default(1),
  paymentMethod: z.enum(ORDER_PAYMENT_METHODS).default("WALLET"),
});
export type CreateMarketplaceOrderInput = z.infer<typeof createMarketplaceOrderSchema>;

export const marketplaceOrderPublicSchema = z.object({
  id: z.string(),
  listingId: z.string(),
  listingTitle: z.string(),
  buyerId: z.string(),
  sellerId: z.string(),
  counterpartyEmail: z.string(),
  quantity: z.number().int(),
  unitPrice: z.number(),
  subtotal: z.number(),
  buyerFee: z.number(),
  sellerFee: z.number(),
  platformFee: z.number(),
  buyerTotal: z.number(),
  sellerProceeds: z.number(),
  currency: z.string(),
  status: z.enum(MARKETPLACE_ORDER_STATUSES),
  paymentMethod: z.enum(ORDER_PAYMENT_METHODS),
  /** Present only when the order needs a card payment to settle. */
  clientSecret: z.string().nullable(),
  createdAt: z.string(),
});
export type MarketplaceOrderPublic = z.infer<typeof marketplaceOrderPublicSchema>;

/** A quote shown before committing, so fees are never a surprise at checkout. */
export const marketplaceQuoteSchema = z.object({
  subtotal: z.number(),
  buyerFee: z.number(),
  buyerTotal: z.number(),
  sellerFee: z.number(),
  sellerProceeds: z.number(),
  currency: z.string(),
});
export type MarketplaceQuote = z.infer<typeof marketplaceQuoteSchema>;
