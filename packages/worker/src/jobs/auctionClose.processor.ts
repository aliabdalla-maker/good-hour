import { Worker } from "bullmq";
import { redisConnection } from "../../../api/src/queue/connection";
import { QUEUE_NAMES } from "../../../api/src/queue/queues";
import { prisma } from "@gihtcx/db";
import { closeAuction } from "../../../api/src/modules/auctions";

/**
 * Closes an auction when its clock runs out: picks the winner, marks the losers,
 * and settles immediately if the winning bid carried an autoSettle mandate.
 *
 * closeAuction is idempotent on status, so a retried job can't double-settle.
 */
export function startAuctionCloseWorker() {
  return new Worker<{ auctionId: string }>(
    QUEUE_NAMES.auctionClose,
    async (job) => {
      await closeAuction(job.data.auctionId);
    },
    { connection: redisConnection }
  );
}

/**
 * Safety net for the delayed close jobs: if Redis lost them (restart without
 * persistence, a job that failed), auctions past their closing time would stay
 * OPEN forever. Every minute, close anything overdue. closeAuction is
 * idempotent, so racing the delayed job is harmless.
 */
export function startAuctionSweep(intervalMs = 60_000) {
  const sweep = async () => {
    try {
      const overdue = await prisma.marketplaceAuction.findMany({
        where: { status: "OPEN", closesAt: { lte: new Date() } },
        select: { id: true },
        take: 100,
      });
      for (const { id } of overdue) {
        await closeAuction(id).catch((err: unknown) =>
          console.error(`[worker] auction sweep failed for ${id}:`, err instanceof Error ? err.message : err)
        );
      }
      if (overdue.length) console.log(`[worker] auction sweep closed ${overdue.length} overdue auction(s)`);
    } catch (err) {
      console.error("[worker] auction sweep error:", err instanceof Error ? err.message : err);
    }
  };
  void sweep();
  return setInterval(sweep, intervalMs);
}
