import { z } from "zod";
import { VERIFICATION_STATUSES } from "../enums";

// Supplier submits business details to request verification.
export const submitVerificationSchema = z.object({
  businessName: z.string().min(2).max(200),
  registrationId: z.string().max(100).optional(),
  contactPhone: z.string().max(40).optional(),
  note: z.string().max(1000).optional(),
});
export type SubmitVerificationInput = z.infer<typeof submitVerificationSchema>;

// Admin approves or rejects a pending supplier.
export const verificationDecisionSchema = z.object({
  approve: z.boolean(),
  note: z.string().max(1000).optional(),
});
export type VerificationDecisionInput = z.infer<typeof verificationDecisionSchema>;

export const verificationStatusSchema = z.object({
  status: z.enum(VERIFICATION_STATUSES),
  note: z.string().nullable(),
  verifiedAt: z.string().nullable(),
});
export type VerificationStatusView = z.infer<typeof verificationStatusSchema>;

export const pendingSupplierSchema = z.object({
  userId: z.string(),
  email: z.string(),
  note: z.string().nullable(),
  submittedAt: z.string(),
});
export type PendingSupplier = z.infer<typeof pendingSupplierSchema>;
