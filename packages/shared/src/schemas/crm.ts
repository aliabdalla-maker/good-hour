import { z } from "zod";
import { CRM_STAGES, ROLES } from "../enums";

export const crmContactSchema = z.object({
  userId: z.string(),
  email: z.string(),
  role: z.enum(ROLES),
  stage: z.enum(CRM_STAGES),
  tags: z.array(z.string()),
  verificationStatus: z.string(),
  createdAt: z.string(),
  lastActivityAt: z.string(),
  bookingsCount: z.number().int(),
  totalSpent: z.number(),
  propertiesCount: z.number().int(),
  notesCount: z.number().int(),
});
export type CrmContact = z.infer<typeof crmContactSchema>;

export const crmNoteSchema = z.object({
  id: z.string(),
  body: z.string(),
  authorId: z.string(),
  createdAt: z.string(),
});
export type CrmNote = z.infer<typeof crmNoteSchema>;

export const crmTimelineItemSchema = z.object({
  kind: z.enum(["booking", "review", "consent", "joined"]),
  label: z.string(),
  detail: z.string().nullable(),
  at: z.string(),
});
export type CrmTimelineItem = z.infer<typeof crmTimelineItemSchema>;

export const crmContactDetailSchema = z.object({
  contact: crmContactSchema,
  notes: z.array(crmNoteSchema),
  timeline: z.array(crmTimelineItemSchema),
});
export type CrmContactDetail = z.infer<typeof crmContactDetailSchema>;

export const updateCrmContactSchema = z.object({
  stage: z.enum(CRM_STAGES).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
});
export type UpdateCrmContactInput = z.infer<typeof updateCrmContactSchema>;

export const addCrmNoteSchema = z.object({ body: z.string().min(1).max(2000) });
export type AddCrmNoteInput = z.infer<typeof addCrmNoteSchema>;

export const crmSummarySchema = z.object({
  total: z.number().int(),
  byStage: z.record(z.enum(CRM_STAGES), z.number().int()),
  contacts: z.array(crmContactSchema),
});
export type CrmSummary = z.infer<typeof crmSummarySchema>;
