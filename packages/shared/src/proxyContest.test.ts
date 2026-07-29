import test from "node:test";
import assert from "node:assert/strict";
import { resolveProxyContest } from "./proxyContest";
import { MIN_BID_INCREMENT, nextValidBid } from "./schemas/auctions";

test("REGRESSION: the higher ceiling wins, whatever the increment", () => {
  // The exact case the looping implementation got wrong: £0.50 increments, a
  // £70 ceiling and a £62 ceiling, lead at £50. The old ladder ran out of rounds
  // around £58 and left the £62 mandate in front.
  const outcome = resolveProxyContest({
    kind: "FORWARD",
    leadingBidderId: "weak",
    leadingPerHour: 50,
    mandates: [
      { bidderId: "weak", maxPerHour: 62 },
      { bidderId: "strong", maxPerHour: 70 },
    ],
  });
  assert.ok(outcome);
  assert.equal(outcome.championId, "strong");
  assert.equal(outcome.referencePerHour, 62);
  // One increment past the runner-up's ceiling, inside the champion's own.
  // reserve is the 2nd arg, the price to beat is the 3rd — mixing them up is
  // what made this assertion read 0.50 on the first run.
  const bid = nextValidBid("FORWARD", 90, outcome.referencePerHour);
  assert.equal(bid, 62 + MIN_BID_INCREMENT);
  assert.ok(bid <= outcome.championCeiling);
});

test("a strictly stronger ceiling always ends in front — swept, not sampled", () => {
  // The property the round cap broke. Sweeping the gap catches an off-by-one in
  // the comparison that a single hand-picked case would not.
  for (let gap = 0.5; gap <= 40; gap += 0.5) {
    const strongCeiling = 62 + gap;
    const outcome = resolveProxyContest({
      kind: "FORWARD",
      leadingBidderId: "weak",
      leadingPerHour: 50,
      mandates: [
        { bidderId: "weak", maxPerHour: 62 },
        { bidderId: "strong", maxPerHour: strongCeiling },
      ],
    });
    assert.ok(outcome, `no outcome at gap ${gap}`);
    assert.equal(outcome.championId, "strong", `wrong champion at gap ${gap}`);
  }
});

test("REVERSE auctions invert 'stronger' — the lowest ceiling wins", () => {
  const outcome = resolveProxyContest({
    kind: "REVERSE",
    leadingBidderId: "dear",
    leadingPerHour: 90,
    mandates: [
      { bidderId: "dear", maxPerHour: 80 },
      { bidderId: "cheap", maxPerHour: 55 },
    ],
  });
  assert.ok(outcome);
  assert.equal(outcome.championId, "cheap");
  assert.equal(outcome.referencePerHour, 80);
  assert.equal(nextValidBid("REVERSE", 90, outcome.referencePerHour), 80 - MIN_BID_INCREMENT);
});

test("the leader with the strongest mandate does not bid against itself", () => {
  const outcome = resolveProxyContest({
    kind: "FORWARD",
    leadingBidderId: "strong",
    leadingPerHour: 65,
    mandates: [
      { bidderId: "strong", maxPerHour: 70 },
      { bidderId: "weak", maxPerHour: 62 },
    ],
  });
  // £62 cannot beat a £65 lead, so there is nothing to answer.
  assert.equal(outcome, null);
});

test("the leader does re-bid when a rival ceiling can still overtake it", () => {
  const outcome = resolveProxyContest({
    kind: "FORWARD",
    leadingBidderId: "strong",
    leadingPerHour: 55,
    mandates: [
      { bidderId: "strong", maxPerHour: 70 },
      { bidderId: "weak", maxPerHour: 62 },
    ],
  });
  assert.ok(outcome);
  assert.equal(outcome.championId, "strong");
  assert.equal(outcome.referencePerHour, 62);
});

test("a lone mandate prices against the live lead, not against itself", () => {
  const outcome = resolveProxyContest({
    kind: "FORWARD",
    leadingBidderId: "human",
    leadingPerHour: 58,
    mandates: [{ bidderId: "agent", maxPerHour: 70 }],
  });
  assert.ok(outcome);
  assert.equal(outcome.championId, "agent");
  assert.equal(outcome.referencePerHour, 58);
});

test("no mandates means no autonomous bid", () => {
  assert.equal(
    resolveProxyContest({
      kind: "FORWARD",
      leadingBidderId: "human",
      leadingPerHour: 58,
      mandates: [],
    }),
    null
  );
});

test("three mandates price off the second-strongest, ignoring the tail", () => {
  const outcome = resolveProxyContest({
    kind: "FORWARD",
    leadingBidderId: "c",
    leadingPerHour: 40,
    mandates: [
      { bidderId: "a", maxPerHour: 70 },
      { bidderId: "b", maxPerHour: 64 },
      { bidderId: "c", maxPerHour: 41 },
    ],
  });
  assert.ok(outcome);
  assert.equal(outcome.championId, "a");
  assert.equal(outcome.referencePerHour, 64);
});

test("autoSettle travels with the winning mandate, defaulting to off", () => {
  const withSettle = resolveProxyContest({
    kind: "FORWARD",
    leadingBidderId: "weak",
    leadingPerHour: 50,
    mandates: [
      { bidderId: "weak", maxPerHour: 62 },
      { bidderId: "strong", maxPerHour: 70, autoSettle: true },
    ],
  });
  assert.equal(withSettle?.championAutoSettle, true);

  const withoutSettle = resolveProxyContest({
    kind: "FORWARD",
    leadingBidderId: "weak",
    leadingPerHour: 50,
    mandates: [
      { bidderId: "weak", maxPerHour: 62 },
      { bidderId: "strong", maxPerHour: 70 },
    ],
  });
  // Full autonomy must be chosen explicitly, never inherited by omission.
  assert.equal(withoutSettle?.championAutoSettle, false);
});
