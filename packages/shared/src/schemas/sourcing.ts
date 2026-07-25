import { z } from "zod";
import { SOURCED_DRAFT_STATUSES, SOURCED_DRAFT_ORIGINS } from "../enums";

/** Import a single external listing by URL (the supplier's own page). */
export const importUrlSchema = z.object({
  url: z.string().url(),
});
export type ImportUrlInput = z.infer<typeof importUrlSchema>;

/** One row of a bulk feed/CSV import. */
export const feedItemSchema = z.object({
  name: z.string().min(1).max(200),
  addressLine: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  amenities: z.array(z.string()).default([]),
  hourlyRate: z.number().positive().optional(),
  currency: z.string().length(3).default("GBP"),
});
export type FeedItemInput = z.infer<typeof feedItemSchema>;

export const importFeedSchema = z.object({
  items: z.array(feedItemSchema).min(1).max(200),
});
export type ImportFeedInput = z.infer<typeof importFeedSchema>;

export const sourcedDraftPublicSchema = z.object({
  id: z.string(),
  origin: z.enum(SOURCED_DRAFT_ORIGINS),
  sourceUrl: z.string().nullable(),
  status: z.enum(SOURCED_DRAFT_STATUSES),
  name: z.string(),
  addressLine: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  amenities: z.array(z.string()),
  suggestedHourlyRate: z.number().nullable(),
  currency: z.string(),
  publishedPropertyId: z.string().nullable(),
  createdAt: z.string(),
});
export type SourcedDraftPublic = z.infer<typeof sourcedDraftPublicSchema>;

/**
 * Supplier-reviewed fields used to publish a draft as a real, bookable
 * property + room. The supplier is accountable for the accuracy of what
 * they publish — nothing goes live without this explicit step.
 */
export const publishDraftSchema = z.object({
  name: z.string().min(2).max(200),
  addressLine: z.string().min(2).max(300),
  city: z.string().min(1).max(100),
  country: z.string().min(1).max(100),
  amenities: z.array(z.string()).default([]),
  roomName: z.string().min(1).max(150).default("Hourly Room"),
  capacity: z.number().int().min(1).max(20).default(2),
  baseHourlyRate: z.number().positive(),
  currency: z.string().length(3).default("GBP"),
  minHours: z.number().int().min(1).max(24).default(2),
  maxHours: z.number().int().min(1).max(24).default(12),
});
export type PublishDraftInput = z.infer<typeof publishDraftSchema>;

export const marketRateSchema = z.object({
  city: z.string(),
  samples: z.number(),
  averageHourlyRate: z.number().nullable(),
  source: z.enum(["scraped", "internal"]),
});
export type MarketRate = z.infer<typeof marketRateSchema>;
