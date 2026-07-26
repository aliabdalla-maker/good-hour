import { test } from "node:test";
import assert from "node:assert/strict";
import { domainEvents, dispatchEvent, clearHandlers } from "./bus";

test("dispatchEvent runs every handler registered for a type, in order", async () => {
  clearHandlers();
  const calls: string[] = [];
  domainEvents.onEvent("booking.created", () => void calls.push("a"));
  domainEvents.onEvent("booking.created", () => void calls.push("b"));
  domainEvents.onEvent("booking.confirmed", () => void calls.push("other"));

  await dispatchEvent("booking.created", { bookingId: "x", travellerId: "y" });

  assert.deepEqual(calls, ["a", "b"]);
});

test("dispatchEvent propagates a handler error so the relay can retry the row", async () => {
  clearHandlers();
  domainEvents.onEvent("booking.created", () => {
    throw new Error("boom");
  });
  await assert.rejects(
    () => dispatchEvent("booking.created", { bookingId: "x", travellerId: "y" }),
    /boom/
  );
});

test("an event type with no handlers dispatches to nothing (no throw)", async () => {
  clearHandlers();
  await dispatchEvent("user.registered", { userId: "x", role: "TRAVELLER" });
});
