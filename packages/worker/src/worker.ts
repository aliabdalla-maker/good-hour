import "dotenv/config";
import { startPricingRefreshWorker } from "./jobs/pricingRefresh.processor";
import { startOfferEvaluationWorker } from "./jobs/offerEvaluation.processor";
import { startBookingExpiryWorker } from "./jobs/bookingExpiry.processor";

const pricingWorker = startPricingRefreshWorker();
const offerWorker = startOfferEvaluationWorker();
const bookingExpiryWorker = startBookingExpiryWorker();

const workers = [pricingWorker, offerWorker, bookingExpiryWorker];
for (const worker of workers) {
  worker.on("completed", (job) => console.log(`[worker] ${job.queueName} job ${job.id} completed`));
  worker.on("failed", (job, err) => console.error(`[worker] ${job?.queueName} job ${job?.id} failed:`, err.message));
}

console.log("[worker] pricing-refresh, offer-evaluation and booking-expiry workers started");

async function shutdown() {
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
