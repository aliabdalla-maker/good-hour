import { prisma } from "@gihtcx/db";
import { AppError } from "../../plugins/errorHandler";
import { applyWalletWrites, getMoneyBalance } from "./ledger";

/**
 * Seller payouts.
 *
 * This existed only as a label. `PAYOUT` was in the wallet-entry enum with a comment
 * saying "reserved — payouts are NOT implemented", and no code path ever wrote one.
 * Sellers could accrue `SALE_PROCEEDS` indefinitely with no way to take the money
 * out. A marketplace that accepts money and cannot return it is not finished, and it
 * cannot honestly recruit a seller — which made this the thing blocking liquidity,
 * not just a missing feature.
 *
 * **The wallet is debited when the payout is REQUESTED, not when it is paid.** This
 * is the whole design. Debiting at payment time would let a seller request a payout
 * and then spend the same balance before the operator sent it: the platform would be
 * out of pocket while every individual ledger entry looked correct. Reserving the
 * funds up front makes the balance mean "what you can still spend", which is the only
 * thing a balance can usefully mean.
 *
 * Only MANUAL payouts are implemented: the operator sends the money out of band and
 * marks the payout paid. Stripe Connect is a named enum value and nothing more — no
 * code path creates a payout with that method, deliberately, because an integration
 * that cannot be exercised should not be claimed.
 */

/** Below this a payout costs more in operator time than it moves. */
export const MIN_PAYOUT_AMOUNT = 10;

export interface RequestPayoutInput {
  amount: number;
  destinationNote?: string;
}

export async function requestPayout(userId: string, input: RequestPayoutInput) {
  const amount = Math.round(input.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError(400, "Enter an amount to withdraw", "INVALID_AMOUNT");
  }
  if (amount < MIN_PAYOUT_AMOUNT) {
    throw new AppError(
      400,
      `The minimum withdrawal is £${MIN_PAYOUT_AMOUNT.toFixed(2)}`,
      "BELOW_MINIMUM"
    );
  }

  // Checked here for a clear message, and enforced again by the ledger's own
  // non-negative assertion inside the transaction below. The check is the courtesy;
  // the assertion is the guarantee.
  const balance = await getMoneyBalance(userId);
  if (balance < amount) {
    throw new AppError(
      409,
      `You can withdraw up to £${balance.toFixed(2)}`,
      "INSUFFICIENT_FUNDS"
    );
  }

  // One in-flight request at a time. Concurrent requests would each pass the balance
  // check above and only the ledger would stop the second — a confusing failure for
  // an operator staring at two pending rows for the same money.
  const inFlight = await prisma.payout.count({ where: { userId, status: "REQUESTED" } });
  if (inFlight > 0) {
    throw new AppError(
      409,
      "You already have a withdrawal awaiting processing",
      "PAYOUT_IN_FLIGHT"
    );
  }

  const payout = await prisma.payout.create({
    data: {
      userId,
      amount,
      currency: "GBP",
      status: "REQUESTED",
      method: "MANUAL",
      destinationNote: input.destinationNote?.trim() || null,
    },
  });

  try {
    await applyWalletWrites([
      {
        userId,
        amount: -amount,
        kind: "PAYOUT",
        currency: "GBP",
        payoutId: payout.id,
        note: `Withdrawal requested (${payout.id.slice(0, 8)})`,
      },
    ]);
  } catch (error) {
    // The debit is the point of the request. If it fails, the request must not
    // survive as a row an operator might pay out against unreserved funds.
    await prisma.payout.delete({ where: { id: payout.id } });
    throw error;
  }

  return toPublicPayout(await prisma.payout.findUniqueOrThrow({ where: { id: payout.id } }));
}

/** Reverses the reservation. Shared by cancel and fail so they cannot diverge. */
async function releaseReservation(payoutId: string, userId: string, reason: string) {
  await applyWalletWrites([
    {
      userId,
      amount: Number(
        (await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } })).amount
      ),
      kind: "REFUND",
      currency: "GBP",
      payoutId,
      note: `Withdrawal ${reason} (${payoutId.slice(0, 8)})`,
    },
  ]);
}

/** A seller withdrawing their own request before it has been paid. */
export async function cancelPayout(userId: string, payoutId: string) {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout || payout.userId !== userId) {
    throw new AppError(404, "Withdrawal not found", "NOT_FOUND");
  }
  if (payout.status !== "REQUESTED") {
    throw new AppError(409, "That withdrawal has already been processed", "NOT_CANCELLABLE");
  }

  // Status first, conditionally: if a concurrent operator action already moved it,
  // updateMany reports zero rows and no money is returned for a payout that was paid.
  const claimed = await prisma.payout.updateMany({
    where: { id: payoutId, status: "REQUESTED" },
    data: { status: "CANCELLED", processedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new AppError(409, "That withdrawal has already been processed", "NOT_CANCELLABLE");
  }

  await releaseReservation(payoutId, userId, "cancelled");
  return toPublicPayout(await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } }));
}

/**
 * Operator marks a payout paid. Idempotent on status: a double-click cannot pay twice.
 *
 * No money moves here — it left the wallet at request time, and the actual transfer
 * happens in the operator's bank. This records that it happened.
 */
export async function markPayoutPaid(payoutId: string, operatorId: string, operatorNote?: string) {
  const claimed = await prisma.payout.updateMany({
    where: { id: payoutId, status: "REQUESTED" },
    data: {
      status: "PAID",
      processedAt: new Date(),
      processedBy: operatorId,
      operatorNote: operatorNote?.trim() || null,
    },
  });
  if (claimed.count === 0) {
    const existing = await prisma.payout.findUnique({ where: { id: payoutId } });
    if (!existing) throw new AppError(404, "Withdrawal not found", "NOT_FOUND");
    if (existing.status === "PAID") return toPublicPayout(existing);
    throw new AppError(409, `That withdrawal is ${existing.status.toLowerCase()}`, "NOT_PAYABLE");
  }

  const payout = await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } });
  await prisma.notification.create({
    data: {
      userId: payout.userId,
      channel: "IN_APP",
      category: "TRANSACTIONAL",
      type: "payout.paid",
      subject: "Your withdrawal has been sent",
      body: `£${Number(payout.amount).toFixed(2)} is on its way to you.`,
      data: { payoutId: payout.id },
    },
  });
  return toPublicPayout(payout);
}

/** Operator marks a payout failed; the reservation goes back to the seller. */
export async function markPayoutFailed(payoutId: string, operatorId: string, operatorNote: string) {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new AppError(404, "Withdrawal not found", "NOT_FOUND");

  const claimed = await prisma.payout.updateMany({
    where: { id: payoutId, status: "REQUESTED" },
    data: {
      status: "FAILED",
      processedAt: new Date(),
      processedBy: operatorId,
      operatorNote: operatorNote.trim(),
    },
  });
  if (claimed.count === 0) {
    throw new AppError(409, `That withdrawal is ${payout.status.toLowerCase()}`, "NOT_FAILABLE");
  }

  await releaseReservation(payoutId, payout.userId, "could not be sent");
  await prisma.notification.create({
    data: {
      userId: payout.userId,
      channel: "IN_APP",
      category: "TRANSACTIONAL",
      type: "payout.failed",
      subject: "Your withdrawal couldn't be sent",
      body: `£${Number(payout.amount).toFixed(2)} is back in your wallet. ${operatorNote.trim()}`,
      data: { payoutId: payout.id },
    },
  });
  return toPublicPayout(await prisma.payout.findUniqueOrThrow({ where: { id: payoutId } }));
}

type PayoutRow = Awaited<ReturnType<typeof prisma.payout.findFirstOrThrow>>;

function toPublicPayout(p: PayoutRow) {
  return {
    id: p.id,
    amount: Number(p.amount),
    currency: p.currency,
    status: p.status,
    method: p.method,
    destinationNote: p.destinationNote,
    operatorNote: p.operatorNote,
    requestedAt: p.requestedAt.toISOString(),
    processedAt: p.processedAt ? p.processedAt.toISOString() : null,
  };
}

export async function listMyPayouts(userId: string) {
  const rows = await prisma.payout.findMany({
    where: { userId },
    orderBy: { requestedAt: "desc" },
    take: 30,
  });
  return rows.map(toPublicPayout);
}

/** The operator queue: oldest request first, because that is the fair order to pay. */
export async function listPendingPayouts() {
  const rows = await prisma.payout.findMany({
    where: { status: "REQUESTED" },
    orderBy: { requestedAt: "asc" },
    take: 100,
    include: { user: { select: { email: true } } },
  });
  return rows.map((p) => ({ ...toPublicPayout(p), sellerEmail: p.user.email }));
}

/** Money owed to sellers that has left their spendable balance but not the platform. */
export async function getPayoutLiability() {
  const agg = await prisma.payout.aggregate({
    where: { status: "REQUESTED" },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return {
    pendingCount: agg._count._all,
    pendingTotal: Number(agg._sum.amount ?? 0),
    currency: "GBP",
  };
}
