import type { FastifyInstance } from "fastify";
import erpRoutes from "./routes";

export default async function erpModule(app: FastifyInstance) {
  app.register(erpRoutes, { prefix: "/erp" });
}
