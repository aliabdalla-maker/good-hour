import "dotenv/config";
import { registerNotificationListeners } from "../../api/src/modules/notifications";
import { startOutboxRelay, stopOutboxRelay } from "../../api/src/events/relay";
import { startPricingRefreshWorker } from "./jobs/pricingRefresh.processor";
import { startOfferEvaluationWorker } from "./jobs/offerEvaluation.processor";
import { startBookingExpiryWorker } from "./jobs/bookingExpiry.processor";

// Domain-event handlers live here (not the api): register them, then start the
// outbox relay that durably drains published events to those handlers.
registerNotificationListeners();
startOutboxRelay();

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
  stopOutboxRelay();
  await Promise.all(workers.map((w) => w.close()));
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
