import { Worker } from "bullmq";
import { prisma } from "@gihtcx/db";
import { redisConnection } from "../../../api/src/queue/connection";
import { QUEUE_NAMES } from "../../../api/src/queue/queues";
import type { PricingRefreshJobData } from "../../../api/src/queue/jobs/types";
import { buildPricingInputForRoom } from "../../../api/src/modules/pricing-agent/signals";
import { recommendRate } from "../../../api/src/modules/pricing-agent/service";

export function startPricingRefreshWorker() {
  return new Worker<PricingRefreshJobData>(
    QUEUE_NAMES.pricingRefresh,
    async (job) => {
      const input = await buildPricingInputForRoom(job.data.roomId);
      const decision = await recommendRate(input);

      await prisma.roomRateRule.create({
        data: {
          roomId: job.data.roomId,
          kind: "AI_DYNAMIC",
          multiplier: decision.rateMultiplier,
        },
      });
    },
    { connection: redisConnection }
  );
}
