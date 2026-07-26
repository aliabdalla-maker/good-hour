import { z } from "zod";

export const assistantMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

export const assistantChatSchema = z.object({
  messages: z.array(assistantMessageSchema).min(1).max(20),
  // The page the user is currently on, so the assistant can be context-aware.
  pageContext: z.string().max(300).optional(),
});
export type AssistantChatInput = z.infer<typeof assistantChatSchema>;

export const assistantActionSchema = z.object({
  type: z.literal("navigate"),
  path: z.string(),
  label: z.string(),
});
export type AssistantAction = z.infer<typeof assistantActionSchema>;

export const assistantReplySchema = z.object({
  reply: z.string(),
  actions: z.array(assistantActionSchema).default([]),
  // True when a real LLM produced the reply (vs the offline fallback).
  aiPowered: z.boolean().default(false),
});
export type AssistantReply = z.infer<typeof assistantReplySchema>;
