import { Worker } from "bullmq";
import { redisConnection } from "../../../api/src/queue/connection";
import { QUEUE_NAMES } from "../../../api/src/queue/queues";
import type { BookingExpiryJobData } from "../../../api/src/queue/jobs/types";
import { releaseExpiredReservation } from "../../../api/src/modules/booking";

/**
 * Releases the held slots of a booking that was never paid within its hold
 * window. `releaseExpiredReservation` is a no-op if the booking was paid,
 * cancelled, or already expired, so re-delivery is safe.
 */
export function startBookingExpiryWorker() {
  return new Worker<BookingExpiryJobData>(
    QUEUE_NAMES.bookingExpiry,
    async (job) => {
      await releaseExpiredReservation(job.data.bookingId);
    },
    { connection: redisConnection }
  );
}
