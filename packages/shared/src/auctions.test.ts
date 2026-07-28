import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTradeFee } from "./money";
import {
  MIN_BID_INCREMENT,
  bidBeats,
  createAuctionSchema,
  nextValidBid,
  placeBidSchema,
} from "./schemas/auctions";

test("a forward auction's first valid bid is the reserve itself", () => {
  assert.equal(nextValidBid("FORWARD", 60, null), 60);
});

test("a reverse auction's first valid bid is the budget ceiling", () => {
  assert.equal(nextValidBid("REVERSE", 60, null), 60);
});

test("forward bids must climb by the increment, reverse bids must fall", () => {
  assert.equal(nextValidBid("FORWARD", 60, 72), 72 + MIN_BID_INCREMENT);
  assert.equal(nextValidBid("REVERSE", 60, 48), 48 - MIN_BID_INCREMENT);
});

test("a reverse auction can never quote a non-positive price", () => {
  // Guards the floor: repeated undercutting must not produce 0 or negative.
  assert.ok(nextValidBid("REVERSE", 1, 0.25) > 0);
});

test("bidBeats runs in opposite directions per auction kind", () => {
  assert.equal(bidBeats("FORWARD", 70, 65), true);
  assert.equal(bidBeats("FORWARD", 60, 65), false);
  assert.equal(bidBeats("REVERSE", 60, 65), true);
  assert.equal(bidBeats("REVERSE", 70, 65), false);
  // With no leader, any bid leads.
  assert.equal(bidBeats("FORWARD", 1, null), true);
  assert.equal(bidBeats("REVERSE", 1, null), true);
});

test("the winning total carries the same 10%/10% as every other trade", () => {
  const hours = 3;
  const perHour = 80;
  const fee = computeTradeFee(Math.round(perHour * hours * 100) / 100);
  assert.equal(fee.subtotal, 240);
  assert.equal(fee.buyerTotal, 264);
  assert.equal(fee.sellerProceeds, 216);
});

test("an auction needs a real title, description and positive reserve", () => {
  const base = {
    kind: "FORWARD" as const,
    title: "Three hours of legal review",
    description: "Contract review with a written summary.",
    category: "legal",
    hours: 3,
    reservePerHour: 60,
    closesAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
  assert.equal(createAuctionSchema.safeParse(base).success, true);
  assert.equal(createAuctionSchema.safeParse({ ...base, reservePerHour: 0 }).success, false);
  assert.equal(createAuctionSchema.safeParse({ ...base, hours: 0.1 }).success, false);
  assert.equal(createAuctionSchema.safeParse({ ...base, title: "ab" }).success, false);
});

test("a reverse auction cannot be raised from a listing", () => {
  const parsed = createAuctionSchema.safeParse({
    kind: "REVERSE",
    title: "Need a van and driver",
    description: "Four hours, central London, same day.",
    category: "transport",
    hours: 4,
    reservePerHour: 30,
    closesAt: new Date(Date.now() + 3_600_000).toISOString(),
    listingId: "abc123",
  });
  assert.equal(parsed.success, false);
});

test("autoSettle defaults to OFF — full autonomy must be chosen", () => {
  const parsed = placeBidSchema.safeParse({ amountPerHour: 70 });
  assert.equal(parsed.success, true);
  if (parsed.success) assert.equal(parsed.data.autoSettle, false);
});
