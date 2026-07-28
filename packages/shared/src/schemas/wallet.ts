import { z } from "zod";

export const WALLET_ENTRY_KINDS = [
  "TOPUP",
  "PURCHASE",
  "SALE_PROCEEDS",
  "REFUND",
  /** Reverses proceeds already paid to a seller (refund or chargeback). */
  "SALE_CLAWBACK",
  "FEE",
  "PAYOUT",
] as const;
export type WalletEntryKind = (typeof WALLET_ENTRY_KINDS)[number];

/** Minimum card top-up. Below this, Stripe's own per-transaction cost dominates. */
export const MIN_TOPUP_AMOUNT = 5;
export const MAX_TOPUP_AMOUNT = 10_000;

export const topUpWalletSchema = z.object({
  amount: z
    .number()
    .min(MIN_TOPUP_AMOUNT, `Minimum top-up is ${MIN_TOPUP_AMOUNT}`)
    .max(MAX_TOPUP_AMOUNT)
    .refine((v) => Math.round(v * 100) === v * 100, {
      message: "Amount can have at most 2 decimal places",
    }),
});
export type TopUpWalletInput = z.infer<typeof topUpWalletSchema>;

export const walletTopUpQuoteSchema = z.object({
  topUpId: z.string(),
  amount: z.number(),
  currency: z.string(),
  clientSecret: z.string().nullable(),
  simulated: z.boolean(),
});
export type WalletTopUpQuote = z.infer<typeof walletTopUpQuoteSchema>;

export const walletLedgerRowSchema = z.object({
  id: z.string(),
  amount: z.number(),
  currency: z.string(),
  kind: z.enum(WALLET_ENTRY_KINDS),
  note: z.string().nullable(),
  counterpartyEmail: z.string().nullable(),
  createdAt: z.string(),
});
export type WalletLedgerRow = z.infer<typeof walletLedgerRowSchema>;

export const moneyWalletSchema = z.object({
  balance: z.number(),
  currency: z.string(),
  /** Lifetime money in from selling, for the "marketplace earnings" view. */
  lifetimeEarnings: z.number(),
  lifetimeSpend: z.number(),
  recent: z.array(walletLedgerRowSchema),
});
export type MoneyWallet = z.infer<typeof moneyWalletSchema>;
