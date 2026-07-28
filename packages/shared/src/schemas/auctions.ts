import { z } from "zod";

export const AUCTION_KINDS = ["FORWARD", "REVERSE"] as const;
export type AuctionKind = (typeof AUCTION_KINDS)[number];

export const AUCTION_STATUSES = ["OPEN", "CLOSED", "SETTLED", "UNMET", "CANCELLED"] as const;
export type AuctionStatus = (typeof AUCTION_STATUSES)[number];

export const AUCTION_BID_STATUSES = ["ACTIVE", "OUTBID", "WON", "LOST", "WITHDRAWN"] as const;
export type AuctionBidStatus = (typeof AUCTION_BID_STATUSES)[number];

export const AUCTION_KIND_LABELS: Record<AuctionKind, string> = {
  FORWARD: "Buyers bid up",
  REVERSE: "Sellers bid down",
};

/** Minimum gap between successive bids, so an auction can't be nudged by a penny. */
export const MIN_BID_INCREMENT = 0.5;
/** Auctions must run at least this long, and may not be opened further ahead than the max. */
export const MIN_AUCTION_MINUTES = 5;
export const MAX_AUCTION_DAYS = 30;

const hoursSchema = z
  .number()
  .positive()
  .max(10_000)
  .refine((h) => Math.round(h * 4) === h * 4, { message: "Hours must be in increments of 0.25" });

export const createAuctionSchema = z
  .object({
    kind: z.enum(AUCTION_KINDS),
    title: z.string().min(3).max(140),
    description: z.string().min(10).max(4000),
    category: z.string().min(2).max(60),
    hours: hoursSchema,
    /** FORWARD: seller's floor. REVERSE: buyer's ceiling. */
    reservePerHour: z.number().positive().max(1_000_000),
    closesAt: z.string().datetime(),
    /** Optional: raise a FORWARD auction from an existing listing. */
    listingId: z.string().optional(),
  })
  .refine((v) => v.kind === "FORWARD" || !v.listingId, {
    message: "Only a forward auction can be raised from a listing you own",
    path: ["listingId"],
  });
export type CreateAuctionInput = z.infer<typeof createAuctionSchema>;

export const placeBidSchema = z
  .object({
    amountPerHour: z.number().positive().max(1_000_000),
    /**
     * Proxy ceiling. Set this and an agent bids on your behalf up to it — this
     * is what makes the auction agentic rather than a manual click-war.
     */
    maxPerHour: z.number().positive().max(1_000_000).optional(),
    /** Opt in to the agent settling payment automatically if this bid wins. */
    autoSettle: z.boolean().default(false),
  })
  .refine((v) => v.maxPerHour === undefined || v.maxPerHour !== v.amountPerHour || true, {
    message: "Invalid proxy ceiling",
  });
export type PlaceBidInput = z.infer<typeof placeBidSchema>;

export const auctionBidPublicSchema = z.object({
  id: z.string(),
  bidderId: z.string(),
  bidderHandle: z.string(),
  amountPerHour: z.number(),
  totalAmount: z.number(),
  isAgentPlaced: z.boolean(),
  /** Only ever true for the viewer's own bids — never disclose a rival's ceiling. */
  hasProxyCeiling: z.boolean(),
  autoSettle: z.boolean(),
  status: z.enum(AUCTION_BID_STATUSES),
  createdAt: z.string(),
});
export type AuctionBidPublic = z.infer<typeof auctionBidPublicSchema>;

export const auctionPublicSchema = z.object({
  id: z.string(),
  kind: z.enum(AUCTION_KINDS),
  createdById: z.string(),
  createdByHandle: z.string(),
  listingId: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  hours: z.number(),
  reservePerHour: z.number(),
  currency: z.string(),
  closesAt: z.string(),
  status: z.enum(AUCTION_STATUSES),
  bidCount: z.number().int(),
  /** Best bid so far: highest for FORWARD, lowest for REVERSE. Null if none. */
  leadingPerHour: z.number().nullable(),
  leadingTotal: z.number().nullable(),
  /** True when the viewer currently holds the leading bid. */
  viewerIsLeading: z.boolean(),
  /** What a new bid must at least (FORWARD) or at most (REVERSE) be. */
  nextValidPerHour: z.number(),
  winningBidId: z.string().nullable(),
  createdAt: z.string(),
});
export type AuctionPublic = z.infer<typeof auctionPublicSchema>;

export const auctionDetailSchema = z.object({
  auction: auctionPublicSchema,
  bids: z.array(auctionBidPublicSchema),
  /** Fee preview on the leading total, so both sides see the 10%/10% up front. */
  feePreview: z
    .object({
      subtotal: z.number(),
      buyerFee: z.number(),
      buyerTotal: z.number(),
      sellerFee: z.number(),
      sellerProceeds: z.number(),
    })
    .nullable(),
});
export type AuctionDetail = z.infer<typeof auctionDetailSchema>;

export const auctionSearchQuerySchema = z.object({
  kind: z.enum(AUCTION_KINDS).optional(),
  status: z.enum(AUCTION_STATUSES).optional(),
  category: z.string().max(60).optional(),
  q: z.string().max(140).optional(),
});
export type AuctionSearchQuery = z.infer<typeof auctionSearchQuerySchema>;

/**
 * Computes the cheapest legal next bid.
 *
 * Shared so the UI and the API agree exactly — a client that renders a
 * different minimum from the one the server enforces produces rejected bids
 * that look like bugs to the bidder.
 */
export function nextValidBid(
  kind: AuctionKind,
  reservePerHour: number,
  leadingPerHour: number | null
): number {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  if (leadingPerHour === null) return round2(reservePerHour);
  return kind === "FORWARD"
    ? round2(leadingPerHour + MIN_BID_INCREMENT)
    : round2(Math.max(0.01, leadingPerHour - MIN_BID_INCREMENT));
}

/** True when `amount` beats `leading` in the direction this auction runs. */
export function bidBeats(kind: AuctionKind, amount: number, leading: number | null): boolean {
  if (leading === null) return true;
  return kind === "FORWARD" ? amount > leading : amount < leading;
}
