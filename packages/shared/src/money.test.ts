import { test } from "node:test";
import assert from "node:assert/strict";
import { computeFeeBreakdown, BUYER_FEE_RATE, SELLER_FEE_RATE } from "./money";

test("charges 1% to the buyer (on top) and 1% to the seller (from payout)", () => {
  const f = computeFeeBreakdown(100);
  assert.equal(f.subtotal, 100);
  assert.equal(f.travellerFee, 1);
  assert.equal(f.supplierFee, 1);
  assert.equal(f.travellerTotal, 101);
  assert.equal(f.supplierPayout, 99);
  assert.equal(f.platformFee, 2);
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

test("exposes 1% rates per side", () => {
  assert.equal(BUYER_FEE_RATE, 0.01);
  assert.equal(SELLER_FEE_RATE, 0.01);
});
