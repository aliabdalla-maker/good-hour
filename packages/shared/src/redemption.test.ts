import test from "node:test";
import assert from "node:assert/strict";
import { redemptionValue } from "./redemption";

test("REGRESSION: credits cannot mint value on the dearest unit in a category", () => {
  // The shipped arbitrage: 2 hours acquired at a £30.25 category average,
  // redeemed against a £42/hr suite. Uncapped that drew £84.00 of inventory for
  // £60.50 of liability — a 37.5% gain funded by the platform.
  assert.equal(redemptionValue(2, 42, 30.25), 60.5);
});

test("the value never exceeds either bound, swept across a wide spread", () => {
  // The invariant, stated as an assertion instead of as a reassuring comment.
  for (let hours = 0.25; hours <= 12; hours += 0.25) {
    for (const rate of [5, 18.5, 30.25, 42, 99.99, 250]) {
      for (const unit of [5, 18.5, 30.25, 42, 99.99, 250]) {
        const value = redemptionValue(hours, rate, unit);
        const ceiling = Math.min(
          Math.round(hours * rate * 100) / 100,
          Math.round(hours * unit * 100) / 100
        );
        assert.ok(
          value <= ceiling + 1e-9,
          `${hours}h at rate ${rate} / unit ${unit} redeemed ${value} > ${ceiling}`
        );
      }
    }
  }
});

test("a cheaper booking than the acquisition rate is capped by the booking, not the credit", () => {
  // The other direction: no windfall for the platform either. Redeeming against a
  // £12/hr room draws £12, not the £30.25 the hours were bought at.
  assert.equal(redemptionValue(1, 12, 30.25), 12);
});

test("equal rates redeem at face value with no drift", () => {
  assert.equal(redemptionValue(3, 30, 30), 90);
  assert.equal(redemptionValue(0.25, 80.8, 80.8), 20.2);
});

test("non-positive hours redeem nothing", () => {
  assert.equal(redemptionValue(0, 42, 30.25), 0);
  assert.equal(redemptionValue(-4, 42, 30.25), 0);
});

test("rounding lands on whole pence, never a fraction of one", () => {
  for (let hours = 0.25; hours <= 8; hours += 0.25) {
    const pence = Math.round(redemptionValue(hours, 33.33, 33.33) * 100);
    assert.equal(redemptionValue(hours, 33.33, 33.33), pence / 100);
  }
});
