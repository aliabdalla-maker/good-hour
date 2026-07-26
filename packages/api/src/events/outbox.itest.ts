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

  await drainOutboxOnce();

  assert.ok(seen.includes(marker), "the handler ran for our event");
  const after = await prisma.outboxEvent.findUnique({ where: { id: row!.id } });
  assert.equal(after?.status, "PROCESSED");
  assert.ok(after?.processedAt, "processedAt was set");
});
