import { PrismaClient } from "@prisma/client";

declare global {
  var __gihtcxPrisma: PrismaClient | undefined;
}

export const prisma =
  global.__gihtcxPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__gihtcxPrisma = prisma;
}

export * from "@prisma/client";
