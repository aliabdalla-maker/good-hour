import { z } from "zod";
import { LISTING_CATEGORIES } from "../enums";

// Accepts an absolute http(s) URL, a site-relative path (our own seeded
// static photos, e.g. "/listings/room.jpg" -- plain .url() rejects these),
// or a data:image/... URI (AI-generated photos, which can legitimately run
// to hundreds of KB of base64 text). Capped well above any realistic
// generated image so it still bounds worst-case abuse.
const imageUrlValue = z
  .string()
  .max(2_000_000)
  .refine(
    (v) => v.startsWith("http://") || v.startsWith("https://") || v.startsWith("/") || v.startsWith("data:image/"),
    { message: "imageUrl must be an http(s) URL, a site-relative path, or a data:image/ URI" }
  );

export const createPropertySchema = z.object({
  name: z.string().min(2).max(200),
  category: z.enum(LISTING_CATEGORIES).default("ROOM"),
  addressLine: z.string().min(2).max(300),
  city: z.string().min(1).max(100),
  country: z.string().min(1).max(100),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  amenities: z.array(z.string()).default([]),
});
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const createRoomSchema = z.object({
  propertyId: z.string(),
  name: z.string().min(1).max(150),
  capacity: z.number().int().min(1).max(20),
  amenities: z.array(z.string()).default([]),
  imageUrl: imageUrlValue.optional(),
  /** True when imageUrl came from the Nano Banana generate button, not a pasted URL. */
  imageIsAiGenerated: z.boolean().default(false),
  baseHourlyRate: z.number().positive(),
  currency: z.string().length(3).default("GBP"),
  minHours: z.number().int().min(1).max(24).default(2),
  maxHours: z.number().int().min(1).max(24).default(24),
  /** B2A: let this room's supplier agent auto-submit offers on matching bid requests. */
  autoOfferEnabled: z.boolean().default(false),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const propertyPublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(LISTING_CATEGORIES),
  /** True only when the host has passed admin verification. */
  hostVerified: z.boolean().default(false),
  addressLine: z.string(),
  city: z.string(),
  country: z.string(),
  lat: z.number(),
  lng: z.number(),
  amenities: z.array(z.string()),
});
export type PropertyPublic = z.infer<typeof propertyPublicSchema>;

export const roomPublicSchema = z.object({
  id: z.string(),
  propertyId: z.string(),
  name: z.string(),
  capacity: z.number(),
  amenities: z.array(z.string()),
  imageUrl: z.string().nullable().default(null),
  imageIsAiGenerated: z.boolean().default(false),
  baseHourlyRate: z.number(),
  currency: z.string(),
  minHours: z.number(),
  maxHours: z.number(),
  status: z.string(),
  autoOfferEnabled: z.boolean(),
  /** Aggregate review rating for this unit (null until it has any reviews). */
  avgRating: z.number().nullable().default(null),
  reviewCount: z.number().default(0),
  /** Present on the single-room detail endpoint so the UI can show property context. */
  property: propertyPublicSchema.optional(),
});
export type RoomPublic = z.infer<typeof roomPublicSchema>;

export const propertyWithRoomsSchema = propertyPublicSchema.extend({
  rooms: z.array(roomPublicSchema),
});
export type PropertyWithRooms = z.infer<typeof propertyWithRoomsSchema>;
