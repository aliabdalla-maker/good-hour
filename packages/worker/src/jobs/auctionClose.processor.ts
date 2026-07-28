import { Worker } from "bullmq";
import { redisConnection } from "../../../api/src/queue/connection";
import { QUEUE_NAMES } from "../../../api/src/queue/queues";
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
