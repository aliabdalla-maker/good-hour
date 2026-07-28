import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTradeFee, BUYER_FEE_RATE } from "./money";
import {
  createMarketplaceListingSchema,
  marketplaceSearchQuerySchema,
  PRICING_UNIT_LABELS,
  PRICING_UNITS,
} from "./schemas/marketplace";
import { topUpWalletSchema, MIN_TOPUP_AMOUNT } from "./schemas/wallet";

const pence = (n: number) => Math.round(n * 100);

test("an order charges the buyer fee on top and the seller fee from proceeds", () => {
  const q = computeTradeFee(200);
  assert.equal(q.buyerTotal, 220);
  assert.equal(q.sellerProceeds, 180);
  assert.equal(q.platformFee, 40);
});

test("multi-quantity orders fee on the line total, not per unit", () => {
  // 3 x 19.99 = 59.97; the fee is charged on the LINE TOTAL, not per unit —
  // per-unit rounding drifts from line-total rounding at many prices.
  const unit = 19.99;
  const qty = 3;
  const line = Math.round(unit * qty * 100) / 100;
  const q = computeTradeFee(line);
  assert.equal(pence(q.subtotal), pence(line));
  assert.equal(pence(q.buyerFee), Math.round(pence(line) * BUYER_FEE_RATE));
});

test("every pricing unit has a human label", () => {
  for (const u of PRICING_UNITS) {
    assert.ok(PRICING_UNIT_LABELS[u], `${u} needs a label`);
  }
});

test("a listing needs a usable title, description and category", () => {
  const base = { kind: "SERVICE" as const, title: "Legal advice", description: "Contract review and advice.", category: "legal", price: 120 };
  assert.equal(createMarketplaceListingSchema.safeParse(base).success, true);
  assert.equal(createMarketplaceListingSchema.safeParse({ ...base, title: "ab" }).success, false);
  assert.equal(createMarketplaceListingSchema.safeParse({ ...base, description: "short" }).success, false);
  assert.equal(createMarketplaceListingSchema.safeParse({ ...base, price: 0 }).success, false);
  assert.equal(createMarketplaceListingSchema.safeParse({ ...base, price: -5 }).success, false);
});

test("a service listing may have null stock (unmetered)", () => {
  const parsed = createMarketplaceListingSchema.safeParse({
    kind: "SERVICE",
    title: "Translation",
    description: "English to French, per hour.",
    category: "translation",
    price: 45,
    stock: null,
  });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.stock, null);
});

test("search querystring coerces numeric price filters from strings", () => {
  const parsed = marketplaceSearchQuerySchema.safeParse({ minPrice: "10", maxPrice: "99.5" });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.minPrice, 10);
    assert.equal(parsed.data.maxPrice, 99.5);
    assert.equal(parsed.data.sort, "newest");
  }
});

test("top-up enforces a floor and rejects sub-penny amounts", () => {
  assert.equal(topUpWalletSchema.safeParse({ amount: MIN_TOPUP_AMOUNT }).success, true);
  assert.equal(topUpWalletSchema.safeParse({ amount: 25.5 }).success, true);
  assert.equal(topUpWalletSchema.safeParse({ amount: MIN_TOPUP_AMOUNT - 1 }).success, false);
  assert.equal(topUpWalletSchema.safeParse({ amount: 10.001 }).success, false);
});
