import { z } from "zod";

export const createMessageSchema = z.object({
  bookingId: z.string(),
  body: z.string().min(1).max(2000),
});
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const messagePublicSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  body: z.string(),
  senderRole: z.enum(["traveller", "host"]),
  senderName: z.string(),
  createdAt: z.string(),
  /** True when the current viewer sent this message (for chat alignment). */
  mine: z.boolean(),
});
export type MessagePublic = z.infer<typeof messagePublicSchema>;
