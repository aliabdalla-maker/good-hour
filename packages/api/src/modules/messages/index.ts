import type { FastifyInstance } from "fastify";
import messagesRoutes from "./routes";

export default async function messagesModule(app: FastifyInstance) {
  app.register(messagesRoutes, { prefix: "/messages" });
}
