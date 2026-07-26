import { prisma } from "@gihtcx/db";
import { dispatchEvent } from "./bus";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;
// A PROCESSING row untouched for this long is assumed abandoned (relay crashed
// mid-dispatch) and is reclaimed for retry.
const STUCK_MS = 60_000;

/**
 * Drain one batch of pending outbox events. Each row is atomically claimed
 * (PENDING -> PROCESSING) so multiple relay instances never double-process the
 * same event. On success the row is marked PROCESSED; on failure it goes back
 * to PENDING for retry, or FAILED once it exhausts MAX_ATTEMPTS.
 */
export async function drainOutboxOnce(): Promise<{ processed: number; failed: number }> {
  // Reclaim rows stuck in PROCESSING from a crashed relay.
  await prisma.outboxEvent.updateMany({
    where: { status: "PROCESSING", updatedAt: { lt: new Date(Date.now() - STUCK_MS) } },
    data: { status: "PENDING" },
  });

  const rows = await prisma.outboxEvent.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
  });

  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    // Claim atomically: only the instance that flips PENDING->PROCESSING wins.
    const claim = await prisma.outboxEvent.updateMany({
      where: { id: row.id, status: "PENDING" },
      data: { status: "PROCESSING", attempts: { increment: 1 } },
    });
    if (claim.count === 0) continue;

    try {
      await dispatchEvent(row.type, row.payload);
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: { status: "PROCESSED", processedAt: new Date(), lastError: null },
      });
      processed++;
    } catch (err) {
      const willRetry = row.attempts + 1 < MAX_ATTEMPTS;
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: {
          status: willRetry ? "PENDING" : "FAILED",
          lastError: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        },
      });
      if (!willRetry) failed++;
    }
  }

  return { processed, failed };
}

let timer: NodeJS.Timeout | null = null;

/** Start the polling relay. Idempotent — a second call is a no-op. */
export function startOutboxRelay(intervalMs = 2000) {
  if (timer) return;
  timer = setInterval(() => {
    drainOutboxOnce().catch((e) => console.error("[outbox] drain error:", e));
  }, intervalMs);
  // Don't keep the event loop alive solely for the relay.
  timer.unref?.();
  console.log(`[outbox] relay started (polling every ${intervalMs}ms)`);
}

export function stopOutboxRelay() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
