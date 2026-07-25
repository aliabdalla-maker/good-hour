import type { FastifyInstance } from "fastify";
import notificationsRoutes from "./routes";

export default async function notificationsModule(app: FastifyInstance) {
  app.register(notificationsRoutes, { prefix: "/notifications" });
}

export { registerNotificationListeners, notify } from "./service";
