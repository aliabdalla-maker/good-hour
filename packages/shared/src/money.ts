/**
 * Platform commission taken on every transaction. Both sides are charged 10%
 * of the agreed price: the buyer pays 10% on top, and the seller gives up 10%
 * from their proceeds. Net platform revenue is 20% of the subtotal.
 *
 * Why 20% and not the 2% this launched with: at 2%, the commission was smaller
 * than the card-processing cost on most of the actual inventory. With Stripe UK
 * at roughly 1.5% + 20p, break-even sat around a £41 subtotal — and four of the
 * six live listings lose money at their own minimum booking duration. Hourly
 * booking is structurally small-ticket, so a 2% take rate was payment-processor
 * pricing, not marketplace pricing. 20% is in line with comparable marketplaces
 * (Fiverr ~20%, Airbnb ~15%, Booking.com 15-25%) and clears processing costs at
 * every realistic basket size.
 *
 * Changing these two constants is sufficient: every fee on the platform —
 * bookings, time-credit purchases, credit exchanges and marketplace orders —
 * derives from computeFeeBreakdown / computeTradeFee below.
 */
export const BUYER_FEE_RATE = 0.1; // 10% charged to the buyer, added on top
export const SELLER_FEE_RATE = 0.1; // 10% charged to the seller, taken from proceeds
/** Combined platform take (buyer + seller side) = 20% of subtotal. */
export const PLATFORM_FEE_RATE = BUYER_FEE_RATE + SELLER_FEE_RATE;

/**
 * Pre-formatted percentage labels for user-facing copy.
 *
 * Every "10%" a customer reads must come from here. Hardcoding the number in
 * page copy is how the UI ends up advertising a rate the code no longer
 * charges — which is worse than an ugly string, because customers act on it.
 */
export const BUYER_FEE_LABEL = `${(BUYER_FEE_RATE * 100).toFixed(0)}%`;
export const SELLER_FEE_LABEL = `${(SELLER_FEE_RATE * 100).toFixed(0)}%`;
export const PLATFORM_FEE_LABEL = `${(PLATFORM_FEE_RATE * 100).toFixed(0)}%`;

export interface FeeBreakdown {
  /** Agreed room price: hours × hourly rate. */
  subtotal: number;
  /** Total platform revenue = travellerFee + supplierFee (2% of subtotal). */
  platformFee: number;
  /** Buyer-side fee (1%), added on top of what the traveller is charged. */
  travellerFee: number;
  /** Seller-side fee (1%), deducted from what the supplier is paid out. */
  supplierFee: number;
  /** What the traveller actually pays (charged via Stripe): subtotal + travellerFee. */
  travellerTotal: number;
  /** What the supplier is remitted: subtotal − supplierFee. */
  supplierPayout: number;
}

/**
 * Computes the platform fee for a booking: 1% from the buyer and 1% from the
 * seller. All arithmetic is done in integer minor units (e.g. pence) to avoid
 * floating-point drift, then converted back to 2-decimal major units.
 */
export function computeFeeBreakdown(subtotal: number): FeeBreakdown {
  const subtotalMinor = Math.round(subtotal * 100);
  const travellerFeeMinor = Math.round(subtotalMinor * BUYER_FEE_RATE);
  const supplierFeeMinor = Math.round(subtotalMinor * SELLER_FEE_RATE);
  const platformFeeMinor = travellerFeeMinor + supplierFeeMinor;
  const toMajor = (minor: number) => minor / 100;

  return {
    subtotal: toMajor(subtotalMinor),
    platformFee: toMajor(platformFeeMinor),
    travellerFee: toMajor(travellerFeeMinor),
    supplierFee: toMajor(supplierFeeMinor),
    travellerTotal: toMajor(subtotalMinor + travellerFeeMinor),
    supplierPayout: toMajor(subtotalMinor - supplierFeeMinor),
  };
}

/**
 * The same 1%-each-side commission expressed in trade-neutral language, for
 * transactions that aren't a traveller booking a supplier's room: buying time
 * credits, trading credits with another user, or selling any other
 * good/product/service through the marketplace.
 *
 * Deliberately delegates to computeFeeBreakdown rather than re-deriving the
 * arithmetic — one implementation of the fee maths, one place to change the
 * rate, and the integer-pence rounding stays identical across every surface.
 */
export interface TradeFeeBreakdown {
  /** Agreed price of the traded item, before any fee. */
  subtotal: number;
  /** Buyer-side 1%, charged on top of the agreed price. */
  buyerFee: number;
  /** Seller-side 1%, deducted from the seller's proceeds. */
  sellerFee: number;
  /** Total platform revenue on the trade (2% of subtotal). */
  platformFee: number;
  /** What the buyer pays: subtotal + buyerFee. */
  buyerTotal: number;
  /** What the seller receives: subtotal − sellerFee. */
  sellerProceeds: number;
}

export function computeTradeFee(subtotal: number): TradeFeeBreakdown {
  const f = computeFeeBreakdown(subtotal);
  return {
    subtotal: f.subtotal,
    buyerFee: f.travellerFee,
    sellerFee: f.supplierFee,
    platformFee: f.platformFee,
    buyerTotal: f.travellerTotal,
    sellerProceeds: f.supplierPayout,
  };
}
