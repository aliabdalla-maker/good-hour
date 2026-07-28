import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFeeBreakdown, BUYER_FEE_RATE, SELLER_FEE_RATE } from "./money";

test("charges the buyer fee on top and the seller fee from payout", () => {
  const f = computeFeeBreakdown(100);
  assert.equal(f.subtotal, 100);
  assert.equal(f.travellerFee, 10);
  assert.equal(f.supplierFee, 10);
  assert.equal(f.travellerTotal, 110);
  assert.equal(f.supplierPayout, 90);
  assert.equal(f.platformFee, 20);
});

// Derived from the constants rather than hardcoded, so a future rate change
// can't leave a passing test asserting a rate the platform no longer charges.
test("a £100 subtotal fees out at exactly the configured rates", () => {
  const f = computeFeeBreakdown(100);
  assert.equal(f.travellerFee, 100 * BUYER_FEE_RATE);
  assert.equal(f.supplierFee, 100 * SELLER_FEE_RATE);
});

test("the two fee halves always sum to the platform fee", () => {
  for (const subtotal of [37, 74, 168, 22, 999.99, 0.5]) {
    const f = computeFeeBreakdown(subtotal);
    assert.equal(Number((f.travellerFee + f.supplierFee).toFixed(2)), f.platformFee);
  }
});

test("traveller pays subtotal + fee; supplier receives subtotal − fee", () => {
  const f = computeFeeBreakdown(37);
  assert.equal(f.travellerTotal, Number((f.subtotal + f.travellerFee).toFixed(2)));
  assert.equal(f.supplierPayout, Number((f.subtotal - f.supplierFee).toFixed(2)));
});

test("no floating-point drift (integer pence math)", () => {
  const f = computeFeeBreakdown(0.1 + 0.2); // 0.30000000000000004
  assert.equal(f.subtotal, 0.3);
});

test("exposes the configured rate per side", () => {
  assert.equal(BUYER_FEE_RATE, 0.1);
  assert.equal(SELLER_FEE_RATE, 0.1);
});
