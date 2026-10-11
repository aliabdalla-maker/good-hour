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
  /** Set on a payout debit and on its reversal, so the pair is reconcilable. */
  payoutId?: string;
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
    payoutId: w.payoutId,
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
export interface ApplyOptions {
  /**
   * Permit a resulting negative balance.
   *
   * Only ever for a clawback (refund/chargeback reversal). A seller who has
   * already spent proceeds that are being reversed genuinely owes the platform
   * money, and a negative balance is the *correct* record of that debt —
   * refusing the write would leave the platform out of pocket with no trace.
   *
   * A negative balance arising from a normal SPEND is a bug (that's what the
   * assertion below exists to prevent); a negative balance arising from a
   * clawback is accounting. Reconciliation queries must distinguish the two —
   * see docs/OPERATIONS.md.
   */
  allowNegative?: boolean;
}

/**
 * How many times a serialisation conflict is retried before the caller sees it.
 *
 * Found by the integration suite, not by reading: ten concurrent £20 spends
 * against a £100 balance had only TWO succeed. The other three affordable ones
 * were rejected with a write conflict. Safe — the balance never went negative —
 * but wrong, because a user with money in their wallet was told to try again
 * purely because someone else transacted at the same moment.
 *
 * P2034 is precisely the error Postgres raises to say "retry me": the transaction
 * did not commit, so there is nothing to undo, and a retry is not a double-spend
 * risk. Idempotency is separately guaranteed by unique index, so even a retry of a
 * write that *did* land surfaces as P2002 rather than a duplicate.
 *
 * Three attempts with jittered backoff. Jitter matters: without it, conflicting
 * transactions retry in lockstep and collide again.
 */
const MAX_SERIALISATION_ATTEMPTS = 3;

function isSerialisationConflict(error: unknown): boolean {
  return (error as { code?: string })?.code === "P2034";
}

export async function applyWalletWrites(
  writes: WalletWrite[],
  options: ApplyOptions = {}
): Promise<void> {
  if (writes.length === 0) return;
  const touched = [...new Set(writes.map((w) => w.userId))];

  try {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await prisma.$transaction(
          async (tx) => {
            await tx.walletLedgerEntry.createMany({ data: writes.map(toData) });
            if (options.allowNegative) return;
            for (const userId of touched) {
              const balance = await getMoneyBalance(userId, tx);
              if (balance < 0) {
                throw new AppError(
                  409,
                  "Not enough money in your wallet. Top up and try again",
                  "INSUFFICIENT_FUNDS"
                );
              }
            }
          },
          { isolationLevel: "Serializable" }
        );
        break;
      } catch (error) {
        // INSUFFICIENT_FUNDS is a real answer, not a conflict — never retry it.
        if (!isSerialisationConflict(error) || attempt >= MAX_SERIALISATION_ATTEMPTS) throw error;
        const backoffMs = 15 * attempt + Math.floor(Math.random() * 25);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    const code = (error as { code?: string }).code;
    if (code === "P2034") {
      throw new AppError(
        409,
        "Your wallet was being changed at the same time. Please try again",
        "WALLET_CONFLICT"
      );
    }
    // A unique-index violation means this exact movement is already recorded —
    // a retried Stripe webhook, a double-clicked button. The desired end state
    // is already true, so this is success rather than an error. This is the
    // guarantee a check-then-write could never give across a crash.
    if (code === "P2002") {
      throw new AppError(409, "That movement is already recorded", "ALREADY_APPLIED");
    }
    throw error;
  }
}

/** True when the error is the idempotency guard firing rather than a real fault. */
export function isAlreadyApplied(error: unknown): boolean {
  return error instanceof AppError && error.code === "ALREADY_APPLIED";
}
