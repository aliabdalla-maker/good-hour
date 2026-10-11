import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { prisma } from "@gihtcx/db";
import { config } from "../config";
import { verifySession, type SessionPayload } from "../modules/auth/session";
import { AppError } from "./errorHandler";

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: SessionPayload;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Like authenticate, but anonymous requests (or bad cookies) pass through without a user. */
    optionalAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      roles: SessionPayload["role"][]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireEmail: (emails: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function authGuardPlugin(app: FastifyInstance) {
  app.decorateRequest("currentUser", undefined);

  app.decorate("authenticate", async (request: FastifyRequest) => {
    const token = request.cookies[config.COOKIE_NAME];
    if (!token) {
      throw new AppError(401, "Authentication required", "UNAUTHENTICATED");
    }
    try {
      request.currentUser = await verifySession(token);
    } catch {
      throw new AppError(401, "Invalid or expired session", "UNAUTHENTICATED");
    }
  });

  app.decorate("optionalAuth", async (request: FastifyRequest) => {
    const token = request.cookies[config.COOKIE_NAME];
    if (!token) return;
    try {
      request.currentUser = await verifySession(token);
    } catch {
      // Expired or invalid cookie on a public route: treat as anonymous.
    }
  });

  app.decorate("requireRole", (roles: SessionPayload["role"][]) => {
    return async (request: FastifyRequest) => {
      if (!request.currentUser) {
        throw new AppError(401, "Authentication required", "UNAUTHENTICATED");
      }
      if (!roles.includes(request.currentUser.role)) {
        throw new AppError(403, "Insufficient permissions", "FORBIDDEN");
      }
    };
  });

  // Gate on the account's actual email, not its role -- for surfaces (like
  // the ERP console) meant for one specific owner-operator, not every
  // ADMIN-role account. Email isn't in the session JWT, so this looks it up.
  app.decorate("requireEmail", (emails: string[]) => {
    return async (request: FastifyRequest) => {
      if (!request.currentUser) {
        throw new AppError(401, "Authentication required", "UNAUTHENTICATED");
      }
      const user = await prisma.user.findUnique({
        where: { id: request.currentUser.sub },
        select: { email: true },
      });
      if (!user || !emails.includes(user.email)) {
        throw new AppError(403, "Insufficient permissions", "FORBIDDEN");
      }
    };
  });
}

export default fp(authGuardPlugin);
