import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTradeFee, BUYER_FEE_RATE, SELLER_FEE_RATE } from "./money";
import { creditHoursSchema, exchangeQuoteQuerySchema } from "./schemas/credits";

test("charges 1% to the buyer and 1% to the seller on any trade", () => {
  const f = computeTradeFee(100);
  assert.equal(f.subtotal, 100);
  assert.equal(f.buyerFee, 1);
  assert.equal(f.sellerFee, 1);
  assert.equal(f.buyerTotal, 101);
  assert.equal(f.sellerProceeds, 99);
  assert.equal(f.platformFee, 2);
});

test("trade fee matches the advertised rates for arbitrary amounts", () => {
  for (const subtotal of [0.5, 7.77, 19.99, 250, 1234.56]) {
    const f = computeTradeFee(subtotal);
    assert.equal(f.buyerFee, Math.round(subtotal * 100 * BUYER_FEE_RATE) / 100);
    assert.equal(f.sellerFee, Math.round(subtotal * 100 * SELLER_FEE_RATE) / 100);
    // The platform's take is always exactly the two halves, never a rounded
    // 2% of the subtotal — those differ by a penny at some amounts.
    assert.equal(f.platformFee, Math.round((f.buyerFee + f.sellerFee) * 100) / 100);
  }
});

test("buyer pays subtotal + fee and seller keeps subtotal - fee", () => {
  const f = computeTradeFee(80);
  // Compared in pence, not by subtracting the majors: 80.8 - 80 is
  // 0.7999999999999972 in IEEE-754. The implementation is exact because it
  // does its arithmetic in integer pence, and the assertion has to match.
  const pence = (n: number) => Math.round(n * 100);
  assert.equal(pence(f.buyerTotal), pence(f.subtotal) + pence(f.buyerFee));
  assert.equal(pence(f.sellerProceeds), pence(f.subtotal) - pence(f.sellerFee));
});

test("credit hours must be positive and in quarter-hour increments", () => {
  for (const ok of [0.25, 0.5, 1, 2.75, 100]) {
    assert.equal(creditHoursSchema.safeParse(ok).success, true, `${ok} should be valid`);
  }
  for (const bad of [0, -1, 0.1, 1.3, 0.333]) {
    assert.equal(creditHoursSchema.safeParse(bad).success, false, `${bad} should be rejected`);
  }
});

test("exchange quote querystring coerces hours from a string", () => {
  // Query params arrive as strings; without coercion the quarter-hour refine
  // would run against a string and reject every real request.
  const parsed = exchangeQuoteQuerySchema.safeParse({
    fromCategory: "ROOM",
    toCategory: "CAR",
    hours: "2.5",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.hours, 2.5);
});

test("exchange quote rejects a non-quarter-hour string", () => {
  const parsed = exchangeQuoteQuerySchema.safeParse({
    fromCategory: "ROOM",
    toCategory: "CAR",
    hours: "1.1",
  });
  assert.equal(parsed.success, false);
});
