import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./client";

// Integration tests run only when a database is wired up (CI services / local
// docker). Locally without a DB they skip instead of failing.
const skip = process.env.DATABASE_URL ? false : "DATABASE_URL not set";

test("migrations applied: user + consent-event round-trip", { skip }, async (t) => {
  const email = `itest+${Date.now()}@example.com`;
  const user = await prisma.user.create({
    data: { email, passwordHash: "x", role: "TRAVELLER" },
  });
  t.after(async () => {
    await prisma.consentEvent.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  });

  // marketingOptIn defaults to true (schema default holds in the real DB).
  assert.equal(user.marketingOptIn, true);

  await prisma.consentEvent.create({
    data: { userId: user.id, channel: "marketing_email", granted: false, source: "unsubscribe_link" },
  });

  const events = await prisma.consentEvent.findMany({ where: { userId: user.id } });
  assert.equal(events.length, 1);
  assert.equal(events[0].granted, false);
  assert.equal(events[0].source, "unsubscribe_link");
});
