import { z } from "zod";
import { ROLES, SELF_REGISTERABLE_ROLES } from "../enums";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  // NOT the full ROLES list — see SELF_REGISTERABLE_ROLES. Allowing "ADMIN"
  // here was a privilege-escalation hole on an unauthenticated endpoint.
  role: z.enum(SELF_REGISTERABLE_ROLES).default("TRAVELLER"),
  isBusinessAccount: z.boolean().default(false),
  // UK PECR: marketing email needs an explicit opt-in, so this defaults to false
  // and the sign-up form leaves the box unticked.
  marketingOptIn: z.boolean().default(false),
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
