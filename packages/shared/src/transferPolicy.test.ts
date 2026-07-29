import test from "node:test";
import assert from "node:assert/strict";
import {
  TRANSFER_DAILY_COUNT_LIMIT,
  TRANSFER_DAILY_LIMIT_HOURS,
  TRANSFER_VERIFICATION_THRESHOLD_HOURS,
  evaluateTransfer,
} from "./transferPolicy";

const base = {
  senderVerification: "VERIFIED" as const,
  hoursSentInWindow: 0,
  transfersInWindow: 0,
};

test("an ordinary transfer from a verified account is allowed", () => {
  const r = evaluateTransfer({ ...base, hours: 5 });
  assert.equal(r.allowed, true);
  assert.equal(r.refusal, null);
});

test("small transfers do not require verification", () => {
  // The threshold exists to bound exposure, not to block everyday gifting.
  for (const v of ["UNVERIFIED", "PENDING", "REJECTED"] as const) {
    const r = evaluateTransfer({
      ...base,
      senderVerification: v,
      hours: TRANSFER_VERIFICATION_THRESHOLD_HOURS,
    });
    assert.equal(r.allowed, true, `${v} was blocked at the threshold itself`);
  }
});

test("a transfer over the threshold requires a VERIFIED sender", () => {
  const over = TRANSFER_VERIFICATION_THRESHOLD_HOURS + 0.25;
  for (const v of ["UNVERIFIED", "PENDING", "REJECTED"] as const) {
    const r = evaluateTransfer({ ...base, senderVerification: v, hours: over });
    assert.equal(r.allowed, false, `${v} was allowed over the threshold`);
    assert.equal(r.refusal, "VERIFICATION_REQUIRED");
  }
  // PENDING is not VERIFIED. Treating "we're looking at it" as cleared would make
  // the control decorative.
  assert.equal(evaluateTransfer({ ...base, hours: over }).allowed, true);
});

test("identity is checked before volume, so the refusal names the real blocker", () => {
  // Over both limits at once: the sender must be told to verify, not told about a
  // daily cap they would still be under.
  const r = evaluateTransfer({
    ...base,
    senderVerification: "UNVERIFIED",
    hours: TRANSFER_VERIFICATION_THRESHOLD_HOURS + 1,
    hoursSentInWindow: TRANSFER_DAILY_LIMIT_HOURS,
  });
  assert.equal(r.refusal, "VERIFICATION_REQUIRED");
});

test("the rolling daily hour cap is enforced, and the message states what is left", () => {
  const r = evaluateTransfer({ ...base, hours: 10, hoursSentInWindow: TRANSFER_DAILY_LIMIT_HOURS - 5 });
  assert.equal(r.allowed, false);
  assert.equal(r.refusal, "DAILY_HOURS_EXCEEDED");
  assert.match(r.message!, /5h left today/);
});

test("landing exactly on the daily cap is allowed; one quarter-hour past is not", () => {
  assert.equal(
    evaluateTransfer({ ...base, hours: 5, hoursSentInWindow: TRANSFER_DAILY_LIMIT_HOURS - 5 }).allowed,
    true
  );
  assert.equal(
    evaluateTransfer({ ...base, hours: 5.25, hoursSentInWindow: TRANSFER_DAILY_LIMIT_HOURS - 5 })
      .allowed,
    false
  );
});

test("the transfer-count cap catches structuring into many small sends", () => {
  // Splitting one large transfer into many tiny ones must not evade the controls.
  const r = evaluateTransfer({ ...base, hours: 0.25, transfersInWindow: TRANSFER_DAILY_COUNT_LIMIT });
  assert.equal(r.allowed, false);
  assert.equal(r.refusal, "DAILY_COUNT_EXCEEDED");
});

test("a refusal never leaks anything but the sender's own limits", () => {
  const refusals = [
    evaluateTransfer({ ...base, senderVerification: "UNVERIFIED", hours: 999 }),
    evaluateTransfer({ ...base, hours: 999 }),
    evaluateTransfer({ ...base, hours: 1, transfersInWindow: TRANSFER_DAILY_COUNT_LIMIT }),
  ];
  for (const r of refusals) {
    assert.ok(r.message && r.message.length > 0);
    // No email, no id, nothing about the recipient.
    assert.doesNotMatch(r.message, /@|cuid|[a-z0-9]{20,}/i);
  }
});
