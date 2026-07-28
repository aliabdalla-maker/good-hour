import { prisma } from "@gihtcx/db";
import { randomUUID } from "node:crypto";
import type {
  CreditPurchaseQuote,
  CreditWallet,
  ExchangeCreditsInput,
  ExchangeQuote,
  ListingCategory,
  PurchaseCreditsInput,
  TransferCreditsInput,
} from "@gihtcx/shared";
import { computeTradeFee } from "@gihtcx/shared";
import { featureFlags } from "../../config";
import { AppError } from "../../plugins/errorHandler";
import { domainEvents } from "../../events/bus";
import { getStripeClient } from "../payments/stripeClient";
import { applyLedgerWrites, getAvgUnitValue, getBalanceFor, getBalances } from "./ledger";
import { quoteExchange } from "./exchangeAgent";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Reference price for one hour of a category: the mean rate of active inventory. */
async function marketUnitValue(category: ListingCategory): Promise<number> {
  const rooms = await prisma.room.findMany({
    where: { status: "ACTIVE", property: { category } },
    select: { baseHourlyRate: true },
  });
  if (rooms.length === 0) {
    throw new AppError(
      409,
      "There is no active inventory in that category yet, so hours can't be priced",
      "NO_MARKET_PRICE"
    );
  }
  const sum = rooms.reduce((acc, r) => acc + Number(r.baseHourlyRate), 0);
  return round2(sum / rooms.length);
}

export async function getWallet(userId: string): Promise<CreditWallet> {
  const [balances, recent] = await Promise.all([
    getBalances(userId),
    prisma.creditLedgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
  ]);

  // One lookup for every counterparty referenced in the visible history, so a
  // transfer reads as "to alice@…" rather than an opaque cuid.
  const counterpartyIds = [...new Set(recent.map((r) => r.counterpartyUserId).filter((id): id is string => Boolean(id)))];
  const counterparties = counterpartyIds.length
    ? await prisma.user.findMany({ where: { id: { in: counterpartyIds } }, select: { id: true, email: true } })
    : [];
  const emailById = new Map(counterparties.map((u) => [u.id, u.email]));

  return {
    balances,
    totalHours: round2(balances.reduce((acc, b) => acc + b.hours, 0)),
    totalEstimatedValue: round2(balances.reduce((acc, b) => acc + b.estimatedValue, 0)),
    currency: balances[0]?.currency ?? "GBP",
    recent: recent.map((r) => ({
      id: r.id,
      category: r.category,
      hours: Number(r.hours),
      kind: r.kind,
      unitValue: Number(r.unitValue),
      currency: r.currency,
      note: r.note,
      counterpartyEmail: r.counterpartyUserId ? emailById.get(r.counterpartyUserId) ?? null : null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/**
 * Starts a credit purchase. Deliberately does NOT credit the wallet — the
 * ledger entry is written only when Stripe confirms payment (see
 * grantPurchasedCredits, called from the payments webhook). Granting here
 * would hand out free credits to anyone who abandons checkout.
 */
export async function startCreditPurchase(
  userId: string,
  input: PurchaseCreditsInput
): Promise<CreditPurchaseQuote> {
  const unitValue = await marketUnitValue(input.category);
  const fee = computeTradeFee(round2(unitValue * input.hours));

  const purchase = await prisma.creditPurchase.create({
    data: {
      userId,
      category: input.category,
      hours: input.hours,
      unitValue,
      subtotal: fee.subtotal,
      buyerFee: fee.buyerFee,
      total: fee.buyerTotal,
      currency: "GBP",
    },
  });

  if (!featureFlags.paymentsEnabled) {
    // Mirrors the booking flow's simulated-intent behaviour so the credit
    // economy stays testable without Stripe keys.
    await prisma.creditPurchase.update({
      where: { id: purchase.id },
      data: { stripePaymentIntentId: `pi_simulated_credit_${purchase.id}` },
    });
    return {
      purchaseId: purchase.id,
      category: input.category,
      hours: input.hours,
      unitValue,
      subtotal: fee.subtotal,
      buyerFee: fee.buyerFee,
      total: fee.buyerTotal,
      currency: "GBP",
      clientSecret: null,
      simulated: true,
    };
  }

  const stripe = getStripeClient();
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(fee.buyerTotal * 100),
    currency: "gbp",
    automatic_payment_methods: { enabled: true },
    // The webhook routes on this key to tell a credit purchase apart from a
    // booking payment — without it the handler would 404 on an unknown intent.
    metadata: { creditPurchaseId: purchase.id },
  });

  await prisma.creditPurchase.update({
    where: { id: purchase.id },
    data: { stripePaymentIntentId: intent.id },
  });

  return {
    purchaseId: purchase.id,
    category: input.category,
    hours: input.hours,
    unitValue,
    subtotal: fee.subtotal,
    buyerFee: fee.buyerFee,
    total: fee.buyerTotal,
    currency: "GBP",
    clientSecret: intent.client_secret,
    simulated: false,
  };
}

/**
 * Credits the wallet for a paid purchase. Idempotent on `grantedAt` because
 * Stripe retries webhooks, and a double-grant here is free money.
 */
export async function grantPurchasedCredits(purchaseId: string): Promise<void> {
  const purchase = await prisma.creditPurchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) throw new AppError(404, "Credit purchase not found", "NOT_FOUND");
  if (purchase.grantedAt) return;

  await applyLedgerWrites([
    {
      userId: purchase.userId,
      category: purchase.category,
      hours: Number(purchase.hours),
      kind: "PURCHASE",
      unitValue: Number(purchase.unitValue),
      currency: purchase.currency,
      creditPurchaseId: purchase.id,
      note: `Purchased ${Number(purchase.hours)}h`,
    },
  ]);

  await prisma.creditPurchase.update({
    where: { id: purchase.id },
    data: { status: "SUCCEEDED", grantedAt: new Date() },
  });

  await domainEvents.publish({
    type: "credits.purchased",
    payload: {
      userId: purchase.userId,
      category: purchase.category,
      hours: Number(purchase.hours),
    },
  });
}

export async function markCreditPurchaseFailed(purchaseId: string): Promise<void> {
  await prisma.creditPurchase.updateMany({
    where: { id: purchaseId, status: "PENDING" },
    data: { status: "FAILED" },
  });
}

/**
 * Gifts hours to another user. No fee and no money moves — this is the
 * "gift / share with family / transfer to employees" path, distinct from a
 * priced trade. Both halves share a correlationId so the pair is reconcilable.
 */
export async function transferCredits(fromUserId: string, input: TransferCreditsInput) {
  const recipient = await prisma.user.findUnique({ where: { email: input.toEmail } });
  if (!recipient) {
    throw new AppError(404, "No account found with that email", "RECIPIENT_NOT_FOUND");
  }
  if (recipient.id === fromUserId) {
    throw new AppError(400, "You can't transfer credits to yourself", "INVALID_RECIPIENT");
  }

  const balance = await getBalanceFor(fromUserId, input.category);
  if (balance < input.hours) {
    throw new AppError(409, "Not enough time credits in that bucket", "INSUFFICIENT_CREDITS");
  }
  // Transferred hours keep the sender's acquisition value so the recipient's
  // wallet is valued on what was actually paid, not today's market price.
  const unitValue = await getAvgUnitValue(fromUserId, input.category);
  const correlationId = randomUUID();

  await applyLedgerWrites([
    {
      userId: fromUserId,
      category: input.category,
      hours: -input.hours,
      kind: "TRANSFER_OUT",
      unitValue,
      counterpartyUserId: recipient.id,
      correlationId,
      note: input.note ?? `Sent to ${recipient.email}`,
    },
    {
      userId: recipient.id,
      category: input.category,
      hours: input.hours,
      kind: "TRANSFER_IN",
      unitValue,
      counterpartyUserId: fromUserId,
      correlationId,
      note: input.note ?? "Received time credits",
    },
  ]);

  await domainEvents.publish({
    type: "credits.transferred",
    payload: {
      fromUserId,
      toUserId: recipient.id,
      category: input.category,
      hours: input.hours,
    },
  });

  return { correlationId, toEmail: recipient.email, hours: input.hours, category: input.category };
}

export async function getExchangeQuote(
  fromCategory: ListingCategory,
  toCategory: ListingCategory,
  hours: number
): Promise<ExchangeQuote> {
  if (fromCategory === toCategory) {
    throw new AppError(400, "Pick two different categories to exchange between", "SAME_CATEGORY");
  }
  return quoteExchange(fromCategory, toCategory, hours);
}

/**
 * Converts hours from one category to another at a freshly quoted rate.
 *
 * The quote is re-fetched here rather than trusted from the client: a caller
 * could otherwise replay a stale or hand-edited favourable rate.
 */
export async function exchangeCredits(userId: string, input: ExchangeCreditsInput) {
  const quote = await getExchangeQuote(input.fromCategory, input.toCategory, input.hours);
  if (quote.hoursOut <= 0) {
    throw new AppError(409, "That exchange can't be priced right now", "NO_MARKET_PRICE");
  }

  const balance = await getBalanceFor(userId, input.fromCategory);
  if (balance < input.hours) {
    throw new AppError(409, "Not enough time credits in that bucket", "INSUFFICIENT_CREDITS");
  }

  const fromUnitValue = await getAvgUnitValue(userId, input.fromCategory);
  // Price the destination hours off the GROSS conversion, not the net.
  //
  // Dividing the surrendered value by the post-fee hours would inflate the
  // unit value by exactly the fee and hand it straight back — the wallet's
  // total worth would come out unchanged and the exchange commission would be
  // purely cosmetic. Using gross hours keeps one hour worth one hour's share
  // of the money, so the fee genuinely costs the holder ~1% of value, which
  // is the whole point of charging it.
  const outValue = fromUnitValue * input.hours;
  const grossHoursOut = quote.hoursOut + quote.feeHours;
  const toUnitValue = grossHoursOut > 0 ? round2(outValue / grossHoursOut) : 0;
  const correlationId = randomUUID();

  await applyLedgerWrites([
    {
      userId,
      category: input.fromCategory,
      hours: -input.hours,
      kind: "EXCHANGE_OUT",
      unitValue: fromUnitValue,
      correlationId,
      note: `Exchanged to ${input.toCategory} @ ${quote.rate}`,
    },
    {
      userId,
      category: input.toCategory,
      hours: quote.hoursOut,
      kind: "EXCHANGE_IN",
      unitValue: toUnitValue,
      correlationId,
      note: `Exchanged from ${input.fromCategory} @ ${quote.rate}`,
    },
  ]);

  await domainEvents.publish({
    type: "credits.exchanged",
    payload: {
      userId,
      fromCategory: input.fromCategory,
      toCategory: input.toCategory,
      hoursIn: input.hours,
      hoursOut: quote.hoursOut,
    },
  });

  return { quote, correlationId };
}

/**
 * Spends credits against a booking. Called from the booking flow *before* the
 * payment intent is created, so the cash total already reflects the discount.
 * Returns the money value covered by credits.
 */
export async function redeemForBooking(
  userId: string,
  category: ListingCategory,
  hours: number,
  bookingId: string,
  hourlyRate: number
): Promise<number> {
  const balance = await getBalanceFor(userId, category);
  if (balance < hours) {
    throw new AppError(409, "Not enough time credits to cover that", "INSUFFICIENT_CREDITS");
  }
  const unitValue = await getAvgUnitValue(userId, category);

  await applyLedgerWrites([
    {
      userId,
      category,
      hours: -hours,
      kind: "REDEEM",
      unitValue,
      relatedBookingId: bookingId,
      note: `Redeemed ${hours}h against booking`,
    },
  ]);

  // The discount is the listing's own hourly rate, not the wallet's average
  // acquisition cost: an hour credit entitles the holder to an hour of
  // inventory, whatever they originally paid for it.
  return round2(hours * hourlyRate);
}

/** Returns redeemed hours to the wallet when a booking that used them is cancelled. */
export async function refundRedeemedCredits(bookingId: string): Promise<void> {
  const redemptions = await prisma.creditLedgerEntry.findMany({
    where: { relatedBookingId: bookingId, kind: "REDEEM" },
  });
  if (redemptions.length === 0) return;

  const alreadyRefunded = await prisma.creditLedgerEntry.count({
    where: { relatedBookingId: bookingId, kind: "REFUND" },
  });
  if (alreadyRefunded > 0) return;

  await applyLedgerWrites(
    redemptions.map((r) => ({
      userId: r.userId,
      category: r.category,
      hours: Math.abs(Number(r.hours)),
      kind: "REFUND" as const,
      unitValue: Number(r.unitValue),
      currency: r.currency,
      relatedBookingId: bookingId,
      note: "Returned after booking cancellation",
    }))
  );
}

/**
 * Total unredeemed hours across all wallets and what they're worth — the
 * platform's outstanding obligation, which the ERP needs to show as a
 * liability rather than as revenue already earned.
 */
export async function getOutstandingCreditLiability() {
  const rows = await prisma.creditLedgerEntry.findMany({
    select: { category: true, hours: true, unitValue: true },
  });
  let hours = 0;
  let value = 0;
  for (const r of rows) {
    const h = Number(r.hours);
    hours += h;
    value += h * Number(r.unitValue);
  }
  const feeAgg = await prisma.creditPurchase.aggregate({
    where: { status: "SUCCEEDED" },
    _sum: { buyerFee: true, subtotal: true },
  });
  return {
    outstandingHours: round2(hours),
    outstandingValue: round2(value),
    creditsSoldValue: round2(Number(feeAgg._sum.subtotal ?? 0)),
    creditFeeRevenue: round2(Number(feeAgg._sum.buyerFee ?? 0)),
  };
}
