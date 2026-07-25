import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { config } from "../config";
import { verifySession, type SessionPayload } from "../modules/auth/session";
import { AppError } from "./errorHandler";

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: SessionPayload;
  }
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      roles: SessionPayload["role"][]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
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
}

export default fp(authGuardPlugin);
