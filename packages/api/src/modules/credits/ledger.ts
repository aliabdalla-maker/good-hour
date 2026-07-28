import { prisma } from "@gihtcx/db";
import type { Prisma } from "@prisma/client";
import type { CreditBalance, CreditEntryKind, ListingCategory } from "@gihtcx/shared";
import { AppError } from "../../plugins/errorHandler";

/**
 * The wallet has no balance column. Every balance is a SUM over the
 * append-only ledger, which means the only failure mode is a race between two
 * concurrent debits — solved below with a Serializable transaction — rather
 * than a permanently wrong stored number that no amount of later correction
 * can explain.
 */
export async function getBalances(userId: string): Promise<CreditBalance[]> {
  const rows = await prisma.creditLedgerEntry.findMany({
    where: { userId },
    select: { category: true, hours: true, unitValue: true, currency: true },
  });

  const byCategory = new Map<
    string,
    { hours: number; acquiredHours: number; acquiredValue: number; currency: string }
  >();

  for (const row of rows) {
    const hours = Number(row.hours);
    const entry =
      byCategory.get(row.category) ??
      { hours: 0, acquiredHours: 0, acquiredValue: 0, currency: row.currency };
    entry.hours += hours;
    // Weighted average is computed over inflows only. Averaging debits in
    // would let spending cheap hours drag the average of what's still held.
    if (hours > 0) {
      entry.acquiredHours += hours;
      entry.acquiredValue += hours * Number(row.unitValue);
    }
    byCategory.set(row.category, entry);
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return [...byCategory.entries()]
    .map(([category, e]) => {
      const avgUnitValue = e.acquiredHours > 0 ? e.acquiredValue / e.acquiredHours : 0;
      return {
        category: category as ListingCategory,
        hours: round2(e.hours),
        avgUnitValue: round2(avgUnitValue),
        currency: e.currency,
        estimatedValue: round2(e.hours * avgUnitValue),
      };
    })
    // A bucket that has netted to zero is noise in a wallet view.
    .filter((b) => b.hours !== 0)
    .sort((a, b) => b.estimatedValue - a.estimatedValue);
}

export async function getBalanceFor(
  userId: string,
  category: ListingCategory,
  tx: Prisma.TransactionClient = prisma
): Promise<number> {
  const agg = await tx.creditLedgerEntry.aggregate({
    where: { userId, category },
    _sum: { hours: true },
  });
  return Number(agg._sum.hours ?? 0);
}

/** Weighted-average acquisition value of the hours currently held, for pricing an exchange. */
export async function getAvgUnitValue(
  userId: string,
  category: ListingCategory,
  tx: Prisma.TransactionClient = prisma
): Promise<number> {
  const rows = await tx.creditLedgerEntry.findMany({
    where: { userId, category, hours: { gt: 0 } },
    select: { hours: true, unitValue: true },
  });
  let hours = 0;
  let value = 0;
  for (const r of rows) {
    hours += Number(r.hours);
    value += Number(r.hours) * Number(r.unitValue);
  }
  return hours > 0 ? value / hours : 0;
}

export interface LedgerWrite {
  userId: string;
  category: ListingCategory;
  /** Signed: positive credits, negative debits. */
  hours: number;
  kind: CreditEntryKind;
  unitValue: number;
  currency?: string;
  creditPurchaseId?: string;
  relatedBookingId?: string;
  counterpartyUserId?: string;
  correlationId?: string;
  note?: string;
}

function toData(w: LedgerWrite) {
  return {
    userId: w.userId,
    category: w.category,
    hours: w.hours,
    kind: w.kind,
    unitValue: w.unitValue,
    currency: w.currency ?? "GBP",
    creditPurchaseId: w.creditPurchaseId,
    relatedBookingId: w.relatedBookingId,
    counterpartyUserId: w.counterpartyUserId,
    correlationId: w.correlationId,
    note: w.note,
  };
}

/**
 * Applies a set of ledger writes atomically, refusing to let any wallet go
 * negative.
 *
 * Serializable isolation is the load-bearing detail: two concurrent spends of
 * the same hours would each read a sufficient balance under a weaker level and
 * both commit, letting a user spend credits twice. Under Serializable one of
 * them is aborted by Postgres and surfaces as a retryable conflict.
 *
 * The balance check runs *after* the inserts so it validates the post-write
 * state — checking first would reintroduce the read-then-write gap this is
 * meant to close.
 */
export async function applyLedgerWrites(writes: LedgerWrite[]): Promise<void> {
  if (writes.length === 0) return;

  const touched = [...new Set(writes.map((w) => `${w.userId}::${w.category}`))];

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.creditLedgerEntry.createMany({ data: writes.map(toData) });

        for (const key of touched) {
          const [userId, category] = key.split("::") as [string, ListingCategory];
          const balance = await getBalanceFor(userId, category, tx);
          if (balance < 0) {
            throw new AppError(
              409,
              "Not enough time credits in that bucket to complete this",
              "INSUFFICIENT_CREDITS"
            );
          }
        }
      },
      { isolationLevel: "Serializable" }
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    // A Serializable abort means someone else moved the same credits
    // concurrently. That's a retry, not a server fault, so don't dress it up
    // as a 500.
    const code = (error as { code?: string }).code;
    if (code === "P2034") {
      throw new AppError(
        409,
        "That wallet was being changed at the same time — please try again",
        "CREDIT_CONFLICT"
      );
    }
    throw error;
  }
}
