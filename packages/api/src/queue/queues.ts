import { Queue } from "bullmq";
import { redisConnection } from "./connection";

// Stripe webhooks and notification emails are handled synchronously
// in-process (fast, idempotent) rather than through a queue -- only
// genuinely slow/LLM-backed work gets its own queue.
export const QUEUE_NAMES = {
  pricingRefresh: "pricing-refresh",
  offerEvaluation: "offer-evaluation",
  bookingExpiry: "booking-expiry",
} as const;

export const pricingRefreshQueue = new Queue(QUEUE_NAMES.pricingRefresh, {
  connection: redisConnection,
});

export const offerEvaluationQueue = new Queue(QUEUE_NAMES.offerEvaluation, {
  connection: redisConnection,
});

export const bookingExpiryQueue = new Queue(QUEUE_NAMES.bookingExpiry, {
  connection: redisConnection,
});
