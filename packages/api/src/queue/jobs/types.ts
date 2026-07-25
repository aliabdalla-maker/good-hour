export interface PricingRefreshJobData {
  roomId: string;
}

export interface OfferEvaluationJobData {
  bookingRequestId: string;
  reason: "offer_submitted" | "expiry_approaching";
}

export interface BookingExpiryJobData {
  bookingId: string;
}
