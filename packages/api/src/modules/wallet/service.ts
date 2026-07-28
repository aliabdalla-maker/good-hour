import { prisma } from "@gihtcx/db";
import type { MoneyWallet, TopUpWalletInput, WalletTopUpQuote } from "@gihtcx/shared";
import { featureFlags } from "../../config";
import { AppError } from "../../plugins/errorHandler";
import { domainEvents } from "../../events/bus";
import { getStripeClient } from "../payments/stripeClient";
import { applyWalletWrites, getMoneyBalance } from "./ledger";

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function getMoneyWallet(userId: string): Promise<MoneyWallet> {
  const [balance, rows] = await Promise.all([
    getMoneyBalance(userId),
    prisma.walletLedgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);

  const [earnAgg, spendAgg] = await Promise.all([
    prisma.walletLedgerEntry.aggregate({
      where: { userId, kind: "SALE_PROCEEDS" },
      _sum: { amount: true },
    }),
    prisma.walletLedgerEntry.aggregate({
      where: { userId, kind: "PURCHASE" },
      _sum: { amount: true },
    }),
  ]);

  const counterpartyIds = [
    ...new Set(rows.map((r) => r.counterpartyUserId).filter((id): id is string => Boolean(id))),
  ];
  const counterparties = counterpartyIds.length
    ? await prisma.user.findMany({ where: { id: { in: counterpartyIds } }, select: { id: true, email: true } })
    : [];
  const emailById = new Map(counterparties.map((u) => [u.id, u.email]));

  return {
    balance,
    currency: rows[0]?.currency ?? "GBP",
    lifetimeEarnings: round2(Number(earnAgg._sum.amount ?? 0)),
    // PURCHASE rows are negative; report spend as a positive figure.
    lifetimeSpend: round2(Math.abs(Number(spendAgg._sum.amount ?? 0))),
    recent: rows.map((r) => ({
      id: r.id,
      amount: Number(r.amount),
      currency: r.currency,
      kind: r.kind,
      note: r.note,
      counterpartyEmail: r.counterpartyUserId ? emailById.get(r.counterpartyUserId) ?? null : null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/**
 * Starts a card top-up. The wallet is credited from the webhook only — see
 * creditTopUp. No platform fee is charged: putting your own money into your own
 * account isn't a trade. The 1%/1% commission applies to the marketplace
 * transaction, and to buying time credits (which is buying an asset).
 */
export async function startTopUp(userId: string, input: TopUpWalletInput): Promise<WalletTopUpQuote> {
  const topUp = await prisma.walletTopUp.create({
    data: { userId, amount: input.amount, currency: "GBP" },
  });

  if (!featureFlags.paymentsEnabled) {
    await prisma.walletTopUp.update({
      where: { id: topUp.id },
      data: { stripePaymentIntentId: `pi_simulated_topup_${topUp.id}` },
    });
    return {
      topUpId: topUp.id,
      amount: input.amount,
      currency: "GBP",
      clientSecret: null,
      simulated: true,
    };
  }

  const stripe = getStripeClient();
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(input.amount * 100),
    currency: "gbp",
    automatic_payment_methods: { enabled: true },
    // The webhook routes on this key; without it the intent would be looked up
    // in the Payment table, miss, and 404 into an endless Stripe retry.
    metadata: { walletTopUpId: topUp.id },
  });

  await prisma.walletTopUp.update({
    where: { id: topUp.id },
    data: { stripePaymentIntentId: intent.id },
  });

  return {
    topUpId: topUp.id,
    amount: input.amount,
    currency: "GBP",
    clientSecret: intent.client_secret,
    simulated: false,
  };
}

/** Idempotent on `creditedAt` — Stripe retries, and a double-credit is free money. */
export async function creditTopUp(topUpId: string): Promise<void> {
  const topUp = await prisma.walletTopUp.findUnique({ where: { id: topUpId } });
  if (!topUp) throw new AppError(404, "Top-up not found", "NOT_FOUND");
  if (topUp.creditedAt) return;

  await applyWalletWrites([
    {
      userId: topUp.userId,
      amount: Number(topUp.amount),
      kind: "TOPUP",
      currency: topUp.currency,
      topUpId: topUp.id,
      note: "Card top-up",
    },
  ]);

  await prisma.walletTopUp.update({
    where: { id: topUp.id },
    data: { status: "SUCCEEDED", creditedAt: new Date() },
  });

  await domainEvents.publish({
    type: "wallet.topped_up",
    payload: { userId: topUp.userId, amount: Number(topUp.amount) },
  });
}

export async function markTopUpFailed(topUpId: string): Promise<void> {
  await prisma.walletTopUp.updateMany({
    where: { id: topUpId, status: "PENDING" },
    data: { status: "FAILED" },
  });
}

/** Platform-wide money held in user wallets — a liability, like unredeemed hours. */
export async function getWalletLiability() {
  const agg = await prisma.walletLedgerEntry.aggregate({ _sum: { amount: true } });
  const topUps = await prisma.walletTopUp.aggregate({
    where: { status: "SUCCEEDED" },
    _sum: { amount: true },
  });
  return {
    heldBalance: round2(Number(agg._sum.amount ?? 0)),
    lifetimeToppedUp: round2(Number(topUps._sum.amount ?? 0)),
  };
}
