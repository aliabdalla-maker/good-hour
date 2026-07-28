import { z } from "zod";
import { LISTING_CATEGORIES } from "../enums";

const booleanQueryParam = z.preprocess((val) => {
  if (val === "true") return true;
  if (val === "false") return false;
  return val;
}, z.boolean());

export const searchQuerySchema = z.object({
  city: z.string().min(1).max(100).optional(),
  category: z.enum(LISTING_CATEGORIES).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  minCapacity: z.coerce.number().int().min(1).default(1),
  includeAiPrice: booleanQueryParam.default(false),
});
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

export const searchResultSchema = z.object({
  roomId: z.string(),
  propertyId: z.string(),
  propertyName: z.string(),
  category: z.enum(LISTING_CATEGORIES),
  city: z.string(),
  roomName: z.string(),
  capacity: z.number(),
  amenities: z.array(z.string()),
  baseHourlyRate: z.number(),
  aiSuggestedHourlyRate: z.number().nullable(),
  currency: z.string(),
  hours: z.number(),
  estimatedTotal: z.number(),
  imageUrl: z.string().nullable(),
  /// Mirrors Room.imageIsAiGenerated so search cards can disclose a generated
  /// photo, exactly as the browse cards already do.
  imageIsAiGenerated: z.boolean(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;
