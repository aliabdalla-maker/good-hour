import { z } from "zod";

export const erpFinancialSchema = z.object({
  grossBookingValue: z.number(),
  platformFeeRevenue: z.number(),
  supplierPayoutsTotal: z.number(),
  refundedTotal: z.number(),
  currency: z.string(),
});
export type ErpFinancial = z.infer<typeof erpFinancialSchema>;

export const erpBookingPipelineSchema = z.record(z.string(), z.number().int());
export type ErpBookingPipeline = z.infer<typeof erpBookingPipelineSchema>;

export const erpSupplierLedgerRowSchema = z.object({
  supplierId: z.string(),
  email: z.string(),
  verificationStatus: z.string(),
  propertyCount: z.number().int(),
  confirmedBookings: z.number().int(),
  totalPayout: z.number(),
});
export type ErpSupplierLedgerRow = z.infer<typeof erpSupplierLedgerRowSchema>;

export const erpAgentOpsRowSchema = z.object({
  agentType: z.string(),
  totalDecisions: z.number().int(),
  accepted: z.number().int(),
  rejected: z.number().int(),
  noOutcomeYet: z.number().int(),
  avgLatencyMs: z.number(),
});
export type ErpAgentOpsRow = z.infer<typeof erpAgentOpsRowSchema>;

export const erpCrmSnapshotSchema = z.object({
  total: z.number().int(),
  byStage: z.record(z.string(), z.number().int()),
});
export type ErpCrmSnapshot = z.infer<typeof erpCrmSnapshotSchema>;

export const erpBiddingPipelineSchema = z.object({
  requestsByStatus: z.record(z.string(), z.number().int()),
  totalOffers: z.number().int(),
  agentSubmittedOffers: z.number().int(),
  avgOffersPerRequest: z.number(),
  matchRate: z.number(),
});
export type ErpBiddingPipeline = z.infer<typeof erpBiddingPipelineSchema>;

export const erpAiInsightsSchema = z.object({
  summary: z.string(),
  recommendations: z.array(z.string()),
  generatedBy: z.string(),
});
export type ErpAiInsights = z.infer<typeof erpAiInsightsSchema>;

/**
 * Time credits sold but not yet redeemed. This is a liability, not revenue:
 * the money is in the bank but the platform still owes the holder an hour of
 * inventory. Reporting it as earned would overstate the business.
 */
export const erpCreditEconomySchema = z.object({
  outstandingHours: z.number(),
  outstandingValue: z.number(),
  creditsSoldValue: z.number(),
  creditFeeRevenue: z.number(),
});
export type ErpCreditEconomy = z.infer<typeof erpCreditEconomySchema>;

/** Products & services marketplace: GMV, commission earned, catalogue size. */
export const erpMarketplaceSchema = z.object({
  activeProducts: z.number().int(),
  activeServices: z.number().int(),
  paidOrders: z.number().int(),
  grossMerchandiseValue: z.number(),
  commissionRevenue: z.number(),
  sellerProceedsTotal: z.number(),
});
export type ErpMarketplace = z.infer<typeof erpMarketplaceSchema>;

/** Money sitting in user wallets — a liability, like unredeemed hours. */
export const erpWalletSchema = z.object({
  heldBalance: z.number(),
  lifetimeToppedUp: z.number(),
});
export type ErpWallet = z.infer<typeof erpWalletSchema>;

/** Hourly auctions: throughput and how much of the bidding agents are doing. */
export const erpAuctionsSchema = z.object({
  byStatus: z.record(z.string(), z.number().int()),
  settledCount: z.number().int(),
  totalBids: z.number().int(),
  agentPlacedBids: z.number().int(),
  /** 0-1. The share of all bids placed by an agent rather than a human click. */
  agentBidShare: z.number(),
});
export type ErpAuctions = z.infer<typeof erpAuctionsSchema>;

/**
 * Liquidity — FR-030, the only Must-have requirement whose failure makes every
 * other metric on this page meaningless.
 *
 * It sits at the top of the ERP because it went unnoticed for an entire build:
 * 76 capability tasks completed against a marketplace with no listings, no bids
 * and no orders. Capability metrics cannot detect that. This one can.
 *
 * Supply and demand are reported separately because "nothing to buy" and "nobody
 * buying" are different problems with different fixes.
 */
export const erpLiquiditySchema = z.object({
  sellers: z.number(),
  activeUnits: z.number(),
  activeListings: z.number(),
  auctionsCreated: z.number(),
  bidsPlaced: z.number(),
  proxyMandates: z.number(),
  bookingsConfirmed: z.number(),
  ordersPaid: z.number(),
  /** activeUnits + activeListings — is there anything to buy at all? */
  supply: z.number(),
  /** bookingsConfirmed + ordersPaid + bidsPlaced — is anyone transacting? */
  demand: z.number(),
  verdict: z.enum(["NO_MARKET", "NO_SUPPLY", "NO_DEMAND", "TRADING"]),
  /** Share of agent decisions with a recorded outcome, 0..1. */
  agentOutcomeCoverage: z.number(),
  agentDecisions: z.number(),
});
export type ErpLiquidity = z.infer<typeof erpLiquiditySchema>;

export const LIQUIDITY_VERDICT_LABELS: Record<ErpLiquidity["verdict"], string> = {
  NO_MARKET: "No market: no supply and no demand",
  NO_SUPPLY: "No supply: demand with nothing to buy",
  NO_DEMAND: "No demand: supply with no transactions",
  TRADING: "Trading",
};

export const erpOverviewSchema = z.object({
  liquidity: erpLiquiditySchema,
  auctions: erpAuctionsSchema,
  creditEconomy: erpCreditEconomySchema,
  marketplace: erpMarketplaceSchema,
  wallet: erpWalletSchema,
  financial: erpFinancialSchema,
  bookingPipeline: erpBookingPipelineSchema,
  supplierLedger: z.array(erpSupplierLedgerRowSchema),
  agentOps: z.array(erpAgentOpsRowSchema),
  crm: erpCrmSnapshotSchema,
  bidding: erpBiddingPipelineSchema,
  aiInsights: erpAiInsightsSchema,
  generatedAt: z.string(),
});
export type ErpOverview = z.infer<typeof erpOverviewSchema>;
