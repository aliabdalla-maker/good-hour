import type { FastifyInstance } from "fastify";
import authRoutes from "./routes";

export default async function authModule(app: FastifyInstance) {
  app.register(authRoutes, { prefix: "/auth" });
}

export { getUserById, toPublicUser } from "./service";
export { verifySession, signSession } from "./session";
export { exportUserData, eraseUserAccount, ERASED_CRM_TAG } from "./privacy";
