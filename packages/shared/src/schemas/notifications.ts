import { z } from "zod";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_STATUSES,
  CAMPAIGN_AUDIENCES,
} from "../enums";

export const notificationPublicSchema = z.object({
  id: z.string(),
  channel: z.enum(NOTIFICATION_CHANNELS),
  category: z.enum(NOTIFICATION_CATEGORIES),
  type: z.string(),
  subject: z.string(),
  body: z.string(),
  data: z.unknown().nullable().optional(),
  status: z.enum(NOTIFICATION_STATUSES),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type NotificationPublic = z.infer<typeof notificationPublicSchema>;

/** Update the current user's communication preferences. */
export const updatePreferencesSchema = z.object({
  marketingOptIn: z.boolean().optional(),
  phone: z.string().min(5).max(30).nullable().optional(),
});
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

/** Admin-composed marketing campaign announcing platform services. */
export const campaignSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  audience: z.enum(CAMPAIGN_AUDIENCES).default("ALL"),
});
export type CampaignInput = z.infer<typeof campaignSchema>;

export const campaignResultSchema = z.object({
  audience: z.enum(CAMPAIGN_AUDIENCES),
  recipients: z.number(),
  skippedOptOut: z.number(),
  emailDelivery: z.enum(["provider", "logged"]),
});
export type CampaignResult = z.infer<typeof campaignResultSchema>;
