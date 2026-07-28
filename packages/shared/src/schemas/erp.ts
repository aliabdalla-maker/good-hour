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

export const erpOverviewSchema = z.object({
  creditEconomy: erpCreditEconomySchema,
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
