import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { erpOverviewSchema, ERP_ADMIN_EMAIL } from "@gihtcx/shared";
import { getErpOverview } from "./service";

export default async function erpRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/overview",
    {
      preHandler: [app.authenticate, app.requireEmail([ERP_ADMIN_EMAIL])],
      schema: { response: { 200: erpOverviewSchema } },
    },
    async (_request, reply) => reply.send(await getErpOverview())
  );
}
