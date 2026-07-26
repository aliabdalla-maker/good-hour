import { z } from "zod";

export const createReviewSchema = z.object({
  bookingId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const reviewPublicSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  rating: z.number(),
  comment: z.string().nullable(),
  // Privacy: only a masked initial of the reviewer is exposed, never the email.
  authorName: z.string(),
  createdAt: z.string(),
});
export type ReviewPublic = z.infer<typeof reviewPublicSchema>;

export const roomRatingSchema = z.object({
  avgRating: z.number().nullable(),
  reviewCount: z.number().int(),
});
export type RoomRating = z.infer<typeof roomRatingSchema>;
