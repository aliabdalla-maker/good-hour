import { prisma } from "@gihtcx/db";
import { randomUUID } from "node:crypto";

/**
 * Fixtures for integration tests (`*.itest.ts`), which run against a real
 * Postgres rather than a mock.
 *
 * These exist because the most valuable guarantees in this codebase were the ones
 * no unit test could reach. Oversell protection, ledger non-negativity and
 * auction settlement are all enforced by *database* behaviour — conditional
 * updates, Serializable isolation, unique indexes. Mocking Prisma would test the
 * mock's opinion of those semantics, which is worth nothing: the whole point is
 * what Postgres does under contention.
 *
 * Every row created here is namespaced with a unique suffix and torn down, so a
 * run leaves the database as it found it and parallel runs cannot collide.
 */

export function uniq(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export interface Fixture {
  suffix: string;
  userIds: string[];
  propertyIds: string[];
  roomIds: string[];
  listingIds: string[];
  auctionIds: string[];
}

export function newFixture(): Fixture {
  return {
    suffix: randomUUID().slice(0, 8),
    userIds: [],
    propertyIds: [],
    roomIds: [],
    listingIds: [],
    auctionIds: [],
  };
}

export async function makeUser(
  f: Fixture,
  role: "TRAVELLER" | "SUPPLIER" | "ADMIN" = "TRAVELLER"
): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `itest-${role.toLowerCase()}-${randomUUID().slice(0, 12)}@example.test`,
      // Not a real hash and never used to log in — these rows exist only inside a
      // transaction-scoped test and are deleted in teardown.
      passwordHash: "itest-not-a-credential",
      role,
    },
  });
  f.userIds.push(user.id);
  return user.id;
}

export async function makeListing(
  f: Fixture,
  sellerId: string,
  opts: { price?: number; stock?: number | null; kind?: "PRODUCT" | "SERVICE" } = {}
): Promise<string> {
  const listing = await prisma.marketplaceListing.create({
    data: {
      sellerId,
      kind: opts.kind ?? "PRODUCT",
      title: `itest listing ${f.suffix}`,
      description: "Integration-test listing. Created and destroyed by the suite.",
      category: "itest",
      price: opts.price ?? 10,
      pricingUnit: "FIXED",
      stock: opts.stock === undefined ? 1 : opts.stock,
      status: "ACTIVE",
    },
  });
  f.listingIds.push(listing.id);
  return listing.id;
}

export async function makeAuction(
  f: Fixture,
  createdById: string,
  opts: {
    kind?: "FORWARD" | "REVERSE";
    hours?: number;
    reservePerHour?: number;
    closesInMs?: number;
  } = {}
): Promise<string> {
  const auction = await prisma.marketplaceAuction.create({
    data: {
      kind: opts.kind ?? "FORWARD",
      createdById,
      title: `itest auction ${f.suffix}`,
      description: "Integration-test auction.",
      category: "itest",
      hours: opts.hours ?? 2,
      reservePerHour: opts.reservePerHour ?? 50,
      closesAt: new Date(Date.now() + (opts.closesInMs ?? 60_000)),
      status: "OPEN",
    },
  });
  f.auctionIds.push(auction.id);
  return auction.id;
}

/** Puts money in a wallet the only way the ledger allows: an entry. */
export async function fundWallet(userId: string, amount: number): Promise<void> {
  await prisma.walletLedgerEntry.create({
    data: {
      userId,
      amount,
      kind: "TOPUP",
      currency: "GBP",
      note: "itest funding",
    },
  });
}

/**
 * A real WalletTopUp row, because `WalletLedgerEntry.topUpId` is a foreign key.
 * The uniqueness guarantee is `(topUpId, kind)`, so idempotency can only be
 * exercised through an actual top-up record.
 */
export async function makeTopUp(userId: string, amount: number): Promise<string> {
  const topUp = await prisma.walletTopUp.create({
    data: { userId, amount, currency: "GBP", status: "PENDING" },
  });
  return topUp.id;
}

/**
 * A property, a room and hourly OPEN slots covering a window.
 *
 * Booking tests used to reach for whatever seeded room happened to exist, which
 * meant they passed or failed on the state of the developer's database rather than
 * on the code. `createDirectBooking` refuses a range it has no OPEN slots for, so
 * the slots have to be real — this builds them.
 */
export async function makeRoomWithSlots(
  f: Fixture,
  supplierId: string,
  opts: { hourlyRate?: number; startsAt: Date; hours: number }
): Promise<string> {
  const property = await prisma.property.create({
    data: {
      supplierId,
      name: `itest property ${f.suffix}`,
      category: "ROOM",
      addressLine: "1 Integration Test Road",
      city: "Testville",
      country: "GB",
      lat: 51.5,
      lng: -0.12,
      amenities: [],
    },
  });
  f.propertyIds.push(property.id);

  const room = await prisma.room.create({
    data: {
      propertyId: property.id,
      name: `itest room ${f.suffix}`,
      capacity: 4,
      amenities: [],
      baseHourlyRate: opts.hourlyRate ?? 30,
      minHours: 1,
      maxHours: 24,
      status: "ACTIVE",
    },
  });
  f.roomIds.push(room.id);

  // One OPEN slot per hour, aligned to the hour, matching how the booking module
  // reserves them.
  const base = new Date(opts.startsAt);
  base.setMinutes(0, 0, 0);
  await prisma.availabilitySlot.createMany({
    data: Array.from({ length: opts.hours }, (_, i) => ({
      roomId: room.id,
      startsAt: new Date(base.getTime() + i * 3_600_000),
      endsAt: new Date(base.getTime() + (i + 1) * 3_600_000),
      status: "OPEN" as const,
    })),
  });

  return room.id;
}

export async function walletBalance(userId: string): Promise<number> {
  const agg = await prisma.walletLedgerEntry.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return Number(agg._sum.amount ?? 0);
}

/**
 * Deletes everything the fixture created, children first.
 *
 * Ordered explicitly rather than relying on cascade: a missing cascade would
 * otherwise surface as a confusing FK error in an unrelated test.
 */
export async function teardown(f: Fixture): Promise<void> {
  // Domain events first.
  //
  // Publishing goes through the transactional outbox, so every auction close,
  // settlement and order in these tests leaves a PENDING row behind. The relay
  // drains the *20 oldest* pending rows per call — so ~20 leftover auction events
  // silently crowded the outbox suite's own row out of its batch, and that test
  // failed for reasons entirely unrelated to the outbox. Tests that leak state
  // don't fail themselves; they fail whatever runs next.
  //
  // Matching on payload text rather than a known key: the payload shape differs
  // per event type (auctionId, buyerId, orderId, userId), and "any event
  // mentioning something this fixture created" is exactly the intent. Parameterised,
  // so the ids are never interpolated into SQL.
  const ownedIds = [...f.auctionIds, ...f.listingIds, ...f.userIds];
  for (const id of ownedIds) {
    await prisma.$executeRaw`DELETE FROM outbox_events WHERE payload::text LIKE ${`%${id}%`}`;
  }

  if (f.auctionIds.length) {
    // winningBidId is a FK onto AuctionBid, so it has to be released before the
    // bids go — otherwise teardown fails on a constraint rather than on anything
    // the test was about.
    await prisma.marketplaceAuction.updateMany({
      where: { id: { in: f.auctionIds } },
      data: { winningBidId: null },
    });
    await prisma.auctionBid.deleteMany({ where: { auctionId: { in: f.auctionIds } } });
    await prisma.marketplaceAuction.deleteMany({ where: { id: { in: f.auctionIds } } });
  }
  if (f.listingIds.length) {
    await prisma.marketplaceOrder.deleteMany({ where: { listingId: { in: f.listingIds } } });
    await prisma.marketplaceListing.deleteMany({ where: { id: { in: f.listingIds } } });
  }
  if (f.roomIds.length) {
    // Slots reference bookings, bookings reference rooms — so release the slots,
    // then drop the bookings, then the rooms and properties.
    await prisma.availabilitySlot.updateMany({
      where: { roomId: { in: f.roomIds } },
      data: { bookingId: null, status: "OPEN" },
    });
    // Payment rows point at bookings (simulated intents in the test environment),
    // so they go first. The FK chain here is slot -> booking -> payment, and the
    // order below follows it in reverse.
    const bookingIds = (
      await prisma.booking.findMany({
        where: { roomId: { in: f.roomIds } },
        select: { id: true },
      })
    ).map((b) => b.id);
    if (bookingIds.length) {
      await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } });
    }
    await prisma.booking.deleteMany({ where: { roomId: { in: f.roomIds } } });
    await prisma.availabilitySlot.deleteMany({ where: { roomId: { in: f.roomIds } } });
    await prisma.review.deleteMany({ where: { roomId: { in: f.roomIds } } });
    await prisma.room.deleteMany({ where: { id: { in: f.roomIds } } });
  }
  if (f.propertyIds.length) {
    await prisma.property.deleteMany({ where: { id: { in: f.propertyIds } } });
  }
  if (f.userIds.length) {
    // Rows that hang off User by foreign key and are written as a side effect of
    // ordinary operations — terms acceptance on a bid, a dispute note, a receipt
    // notification. Missing them made `user.deleteMany` fail on a constraint inside
    // the `after` hook, which surfaced as the whole suite hanging rather than as any
    // legible error. Teardown has to know about everything the code under test
    // writes, not just what the test wrote itself.
    await prisma.consentEvent.deleteMany({ where: { userId: { in: f.userIds } } });
    await prisma.crmNote.deleteMany({ where: { userId: { in: f.userIds } } });
    await prisma.notification.deleteMany({ where: { userId: { in: f.userIds } } });
    await prisma.marketplaceOrder.deleteMany({ where: { buyerId: { in: f.userIds } } });
    await prisma.walletLedgerEntry.deleteMany({ where: { userId: { in: f.userIds } } });
    await prisma.walletTopUp.deleteMany({ where: { userId: { in: f.userIds } } });
    await prisma.creditLedgerEntry.deleteMany({ where: { userId: { in: f.userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: f.userIds } } });
  }
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
