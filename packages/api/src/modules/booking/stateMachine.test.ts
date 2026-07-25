import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTransitionAllowed } from "./stateMachine";

test("allows the valid booking lifecycle transitions", () => {
  assert.doesNotThrow(() => assertTransitionAllowed("PENDING_PAYMENT", "CONFIRMED"));
  assert.doesNotThrow(() => assertTransitionAllowed("PENDING_PAYMENT", "CANCELLED"));
  assert.doesNotThrow(() => assertTransitionAllowed("PENDING_PAYMENT", "EXPIRED"));
  assert.doesNotThrow(() => assertTransitionAllowed("CONFIRMED", "COMPLETED"));
  assert.doesNotThrow(() => assertTransitionAllowed("CONFIRMED", "CANCELLED"));
});

test("rejects illegal transitions", () => {
  assert.throws(() => assertTransitionAllowed("CONFIRMED", "PENDING_PAYMENT"));
  assert.throws(() => assertTransitionAllowed("CANCELLED", "CONFIRMED"));
  assert.throws(() => assertTransitionAllowed("EXPIRED", "CONFIRMED"));
  assert.throws(() => assertTransitionAllowed("COMPLETED", "CANCELLED"));
});
