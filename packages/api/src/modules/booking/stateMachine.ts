import type { BookingStatus } from "@gihtcx/shared";
import { AppError } from "../../plugins/errorHandler";

/**
 * Generic booking lifecycle -- reused unchanged by both direct-search
 * bookings and accepted-reverse-bid bookings. When other bookable-unit
 * types (vehicles, service slots) are added, they funnel through this
 * same state machine.
 */
const ALLOWED_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED", "EXPIRED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
  CANCELLED: [],
  COMPLETED: [],
  EXPIRED: [],
};

export function assertTransitionAllowed(from: BookingStatus, to: BookingStatus) {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new AppError(409, `Cannot transition booking from ${from} to ${to}`, "INVALID_TRANSITION");
  }
}
