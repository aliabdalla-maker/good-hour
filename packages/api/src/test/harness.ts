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
  listingIds: string[];
  auctionIds: string[];
}

export function newFixture(): Fixture {
  return {
    suffix: randomUUID().slice(0, 8),
    userIds: [],
    propertyIds: [],
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
  if (f.auctionIds.length) {
    await prisma.auctionBid.deleteMany({ where: { auctionId: { in: f.auctionIds } } });
    await prisma.marketplaceAuction.deleteMany({ where: { id: { in: f.auctionIds } } });
  }
  if (f.listingIds.length) {
    await prisma.marketplaceOrder.deleteMany({ where: { listingId: { in: f.listingIds } } });
    await prisma.marketplaceListing.deleteMany({ where: { id: { in: f.listingIds } } });
  }
  if (f.userIds.length) {
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
