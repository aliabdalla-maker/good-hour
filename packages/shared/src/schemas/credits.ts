import { z } from "zod";
import { LISTING_CATEGORIES } from "../enums";

export const CREDIT_ENTRY_KINDS = [
  "PURCHASE",
  "REDEEM",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "EXCHANGE_IN",
  "EXCHANGE_OUT",
  "TRADE_FEE",
  "REFUND",
  "EXPIRY",
] as const;
export type CreditEntryKind = (typeof CREDIT_ENTRY_KINDS)[number];

/**
 * Hours are traded in quarter-hour granularity at finest. Anything smaller
 * invites rounding disputes on exchange, and no supplier sells a 7-minute slot.
 */
export const creditHoursSchema = z
  .number()
  .positive()
  .max(10_000)
  .refine((h) => Math.round(h * 4) === h * 4, {
    message: "Hours must be in increments of 0.25",
  });

export const creditBalanceSchema = z.object({
  category: z.enum(LISTING_CATEGORIES),
  hours: z.number(),
  /** Weighted-average acquisition value of one hour in this bucket. */
  avgUnitValue: z.number(),
  currency: z.string(),
  /** hours × avgUnitValue — what this bucket is nominally worth. */
  estimatedValue: z.number(),
});
export type CreditBalance = z.infer<typeof creditBalanceSchema>;

export const creditLedgerRowSchema = z.object({
  id: z.string(),
  category: z.enum(LISTING_CATEGORIES),
  hours: z.number(),
  kind: z.enum(CREDIT_ENTRY_KINDS),
  unitValue: z.number(),
  currency: z.string(),
  note: z.string().nullable(),
  counterpartyEmail: z.string().nullable(),
  createdAt: z.string(),
});
export type CreditLedgerRow = z.infer<typeof creditLedgerRowSchema>;

export const creditWalletSchema = z.object({
  balances: z.array(creditBalanceSchema),
  totalHours: z.number(),
  totalEstimatedValue: z.number(),
  currency: z.string(),
  recent: z.array(creditLedgerRowSchema),
});
export type CreditWallet = z.infer<typeof creditWalletSchema>;

// --- purchase ---

export const purchaseCreditsSchema = z.object({
  category: z.enum(LISTING_CATEGORIES),
  hours: creditHoursSchema,
});
export type PurchaseCreditsInput = z.infer<typeof purchaseCreditsSchema>;

export const creditPurchaseQuoteSchema = z.object({
  purchaseId: z.string(),
  category: z.enum(LISTING_CATEGORIES),
  hours: z.number(),
  unitValue: z.number(),
  subtotal: z.number(),
  buyerFee: z.number(),
  total: z.number(),
  currency: z.string(),
  clientSecret: z.string().nullable(),
  simulated: z.boolean(),
});
export type CreditPurchaseQuote = z.infer<typeof creditPurchaseQuoteSchema>;

// --- transfer (gift) ---

export const transferCreditsSchema = z.object({
  toEmail: z.string().email(),
  category: z.enum(LISTING_CATEGORIES),
  hours: creditHoursSchema,
  note: z.string().max(280).optional(),
});
export type TransferCreditsInput = z.infer<typeof transferCreditsSchema>;

// --- cross-category exchange ---

export const exchangeQuoteRequestSchema = z.object({
  fromCategory: z.enum(LISTING_CATEGORIES),
  toCategory: z.enum(LISTING_CATEGORIES),
  hours: creditHoursSchema,
});
export type ExchangeQuoteRequest = z.infer<typeof exchangeQuoteRequestSchema>;

/**
 * Querystring flavour of the above — every query param arrives as a string, so
 * `hours` needs coercing before the quarter-hour check can run on a number.
 */
export const exchangeQuoteQuerySchema = z.object({
  fromCategory: z.enum(LISTING_CATEGORIES),
  toCategory: z.enum(LISTING_CATEGORIES),
  hours: z.coerce.number().pipe(creditHoursSchema),
});

export const exchangeQuoteSchema = z.object({
  fromCategory: z.enum(LISTING_CATEGORIES),
  toCategory: z.enum(LISTING_CATEGORIES),
  hoursIn: z.number(),
  /** Hours credited after the platform spread. */
  hoursOut: z.number(),
  /** Platform spread, taken in hours of the destination category. */
  feeHours: z.number(),
  /** Destination hours per source hour, before the spread. */
  rate: z.number(),
  reasoning: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  /** Model name, or "market-rate" when derived from live listing prices. */
  quotedBy: z.string(),
});
export type ExchangeQuote = z.infer<typeof exchangeQuoteSchema>;

export const exchangeCreditsSchema = exchangeQuoteRequestSchema;
export type ExchangeCreditsInput = z.infer<typeof exchangeCreditsSchema>;
