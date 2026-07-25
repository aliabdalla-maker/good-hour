import { EventEmitter } from "node:events";

export type DomainEvent =
  | { type: "user.registered"; payload: { userId: string; role: string } }
  | { type: "booking.created"; payload: { bookingId: string; travellerId: string } }
  | { type: "booking.confirmed"; payload: { bookingId: string } }
  | { type: "booking.cancelled"; payload: { bookingId: string } }
  | { type: "offer.submitted"; payload: { offerId: string; bookingRequestId: string } }
  | { type: "match.recommended"; payload: { bookingRequestId: string; offerId: string } }
  | { type: "payment.succeeded"; payload: { paymentId: string; bookingId: string } }
  | { type: "payment.failed"; payload: { bookingId: string; reason: string } };

class DomainEventBus extends EventEmitter {
  publish(event: DomainEvent) {
    this.emit(event.type, event.payload);
  }

  onEvent<T extends DomainEvent["type"]>(
    type: T,
    handler: (payload: Extract<DomainEvent, { type: T }>["payload"]) => void
  ) {
    this.on(type, handler);
  }
}

export const domainEvents = new DomainEventBus();
