import { prisma } from "@gihtcx/db";
import type { Prisma } from "@prisma/client";
import type { WalletEntryKind } from "@gihtcx/shared";
import { AppError } from "../../plugins/errorHandler";

/**
 * Money wallet, same shape as the time-credit ledger: append-only, no balance
 * column, balance is always a SUM. Kept as a separate table from credits
 * deliberately — different units, different rounding (pence vs quarter-hours),
 * and a shared polymorphic table would need a discriminator on every query to
 * stay correct.
 */
export async function getMoneyBalance(
  userId: string,
  tx: Prisma.TransactionClient = prisma
): Promise<number> {
  const agg = await tx.walletLedgerEntry.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return Math.round(Number(agg._sum.amount ?? 0) * 100) / 100;
}

export interface WalletWrite {
  userId: string;
  /** Signed, major units. Positive credits, negative debits. */
  amount: number;
  kind: WalletEntryKind;
  currency?: string;
  topUpId?: string;
  relatedOrderId?: string;
  counterpartyUserId?: string;
  correlationId?: string;
  note?: string;
}

function toData(w: WalletWrite) {
  return {
    userId: w.userId,
    amount: w.amount,
    kind: w.kind,
    currency: w.currency ?? "GBP",
    topUpId: w.topUpId,
    relatedOrderId: w.relatedOrderId,
    counterpartyUserId: w.counterpartyUserId,
    correlationId: w.correlationId,
    note: w.note,
  };
}

/**
 * Applies money movements atomically, refusing to overdraw any wallet.
 *
 * Serializable isolation with the balance assertion running *after* the inserts
 * — checking before would leave the read-then-write gap that lets two
 * concurrent spends of the same balance both commit. Identical reasoning to
 * `credits/ledger.ts#applyLedgerWrites`; see the comment there.
 */
export async function applyWalletWrites(writes: WalletWrite[]): Promise<void> {
  if (writes.length === 0) return;
  const touched = [...new Set(writes.map((w) => w.userId))];

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.walletLedgerEntry.createMany({ data: writes.map(toData) });
        for (const userId of touched) {
          const balance = await getMoneyBalance(userId, tx);
          if (balance < 0) {
            throw new AppError(
              409,
              "Not enough money in your wallet — top up and try again",
              "INSUFFICIENT_FUNDS"
            );
          }
        }
      },
      { isolationLevel: "Serializable" }
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    const code = (error as { code?: string }).code;
    if (code === "P2034") {
      throw new AppError(
        409,
        "Your wallet was being changed at the same time — please try again",
        "WALLET_CONFLICT"
      );
    }
    throw error;
  }
}
