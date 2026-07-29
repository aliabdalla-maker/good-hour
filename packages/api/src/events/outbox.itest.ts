import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@gihtcx/db";
import { domainEvents, clearHandlers } from "./bus";
import { drainOutboxOnce } from "./relay";

const skip = process.env.DATABASE_URL ? false : "DATABASE_URL not set";

test("publish records a durable PENDING row; the relay drains it to a handler and marks it PROCESSED", { skip }, async (t) => {
  clearHandlers();
  const marker = `itest-${Date.now()}`;
  const seen: string[] = [];
  domainEvents.onEvent("user.registered", (p) => void seen.push(p.userId));

  await domainEvents.publish({ type: "user.registered", payload: { userId: marker, role: "TRAVELLER" } });

  const row = await prisma.outboxEvent.findFirst({
    where: { type: "user.registered", status: "PENDING", payload: { path: ["userId"], equals: marker } },
  });
  assert.ok(row, "an outbox row was written");
  t.after(async () => {
    await prisma.outboxEvent.deleteMany({ where: { id: row!.id } });
    await prisma.$disconnect();
  });

  // Drain until OUR row is processed, rather than assuming one batch reaches it.
  //
  // drainOutboxOnce takes the 20 OLDEST pending rows, so a single call only sees
  // this event if fewer than 20 are already queued. A leftover backlog from
  // another suite pushed it out of the batch and this test failed for a reason
  // that had nothing to do with the outbox. In production the relay polls on a
  // timer and a backlog simply takes a few more ticks — so the loop below is what
  // the real behaviour looks like, and the old single call was the unrealistic part.
  for (let attempt = 0; attempt < 10 && !seen.includes(marker); attempt += 1) {
    const { processed } = await drainOutboxOnce();
    if (processed === 0) break;
  }

  assert.ok(seen.includes(marker), "the handler ran for our event");
  const after = await prisma.outboxEvent.findUnique({ where: { id: row!.id } });
  assert.equal(after?.status, "PROCESSED");
  assert.ok(after?.processedAt, "processedAt was set");
});
