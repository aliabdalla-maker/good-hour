import { z } from "zod";
import { ROLES } from "../enums";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  role: z.enum(ROLES).default("TRAVELLER"),
  isBusinessAccount: z.boolean().default(false),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const userPublicSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum(ROLES),
  isBusinessAccount: z.boolean(),
  createdAt: z.string(),
});
export type UserPublic = z.infer<typeof userPublicSchema>;
