/**
 * Platform commission taken on every booking. Both sides of the marketplace
 * are charged 1% of the agreed room price: the traveller (buyer) pays 1% on
 * top, and the supplier (seller) gives up 1% from their payout. Net platform
 * revenue is therefore 2% of the subtotal.
 */
export const BUYER_FEE_RATE = 0.01; // 1% charged to the traveller, added on top
export const SELLER_FEE_RATE = 0.01; // 1% charged to the supplier, taken from payout
/** Combined platform take (buyer + seller side) = 2% of subtotal. */
export const PLATFORM_FEE_RATE = BUYER_FEE_RATE + SELLER_FEE_RATE;

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
