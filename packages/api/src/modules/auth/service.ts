import argon2 from "argon2";
import { prisma } from "@gihtcx/db";
import type { LoginInput, RegisterInput, Role } from "@gihtcx/shared";
import { AppError } from "../../plugins/errorHandler";
import { domainEvents } from "../../events/bus";
import { signSession } from "./session";

export async function registerUser(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new AppError(409, "An account with this email already exists", "EMAIL_TAKEN");
  }

  const passwordHash = await argon2.hash(input.password);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      role: input.role,
      isBusinessAccount: input.isBusinessAccount,
    },
  });

  domainEvents.publish({ type: "user.registered", payload: { userId: user.id, role: user.role } });

  const token = await signSession({
    sub: user.id,
    role: user.role,
    isBusinessAccount: user.isBusinessAccount,
  });

  return { user, token };
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  const valid = await argon2.verify(user.passwordHash, input.password);
  if (!valid) {
    throw new AppError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }

  const token = await signSession({
    sub: user.id,
    role: user.role,
    isBusinessAccount: user.isBusinessAccount,
  });

  return { user, token };
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new AppError(404, "User not found", "NOT_FOUND");
  }
  return user;
}

export function toPublicUser(user: {
  id: string;
  email: string;
  role: Role;
  isBusinessAccount: boolean;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isBusinessAccount: user.isBusinessAccount,
    createdAt: user.createdAt.toISOString(),
  };
}
