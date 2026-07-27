import { prisma } from "@gihtcx/db";

export type DomainEvent =
  | { type: "user.registered"; payload: { userId: string; role: string } }
  | { type: "booking.created"; payload: { bookingId: string; travellerId: string } }
  | { type: "booking.confirmed"; payload: { bookingId: string } }
  | { type: "booking.cancelled"; payload: { bookingId: string } }
  | { type: "offer.submitted"; payload: { offerId: string; bookingRequestId: string } }
  | { type: "match.recommended"; payload: { bookingRequestId: string; offerId: string } }
  | { type: "request.expired"; payload: { bookingRequestId: string; hadOffers: boolean } }
  | { type: "payment.succeeded"; payload: { paymentId: string; bookingId: string } }
  | { type: "payment.failed"; payload: { bookingId: string; reason: string } };

type EventType = DomainEvent["type"];
type PayloadOf<T extends EventType> = Extract<DomainEvent, { type: T }>["payload"];
type AnyHandler = (payload: unknown) => void | Promise<void>;

// In-process registry of handlers. Registered wherever the outbox relay runs
// (the worker), NOT necessarily where events are published (the api).
const handlers = new Map<string, AnyHandler[]>();

class DomainEventBus {
  /**
   * Durably record a domain event to the transactional outbox. Unlike the old
   * in-process emit, the event survives a process restart and is retried until
   * a handler succeeds. Pass a Prisma transaction client to make the event
   * atomic with the business write that produced it.
   */
  async publish(
    event: DomainEvent,
    client: Pick<typeof prisma, "outboxEvent"> = prisma
  ): Promise<void> {
    await client.outboxEvent.create({
      data: { type: event.type, payload: event.payload as object },
    });
  }

  /** Register a handler for an event type (runs inside the outbox relay). */
  onEvent<T extends EventType>(type: T, handler: (payload: PayloadOf<T>) => void | Promise<void>) {
    const list = handlers.get(type) ?? [];
    list.push(handler as AnyHandler);
    handlers.set(type, list);
  }
}

export const domainEvents = new DomainEventBus();

/**
 * Run every registered handler for one event, awaiting each. Throws if any
 * handler throws, so the relay can retry the outbox row. Used only by the relay.
 */
export async function dispatchEvent(type: string, payload: unknown): Promise<void> {
  for (const handler of handlers.get(type) ?? []) {
    await handler(payload);
  }
}

/** Test seam: drop all registered handlers. */
export function clearHandlers() {
  handlers.clear();
}
