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

export const erpOverviewSchema = z.object({
  financial: erpFinancialSchema,
  bookingPipeline: erpBookingPipelineSchema,
  supplierLedger: z.array(erpSupplierLedgerRowSchema),
  agentOps: z.array(erpAgentOpsRowSchema),
  generatedAt: z.string(),
});
export type ErpOverview = z.infer<typeof erpOverviewSchema>;
