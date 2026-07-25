import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  campaignSchema,
  campaignResultSchema,
  notificationPublicSchema,
  updatePreferencesSchema,
} from "@gihtcx/shared";
import {
  getPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  sendCampaign,
  toPublicNotification,
  unsubscribeByToken,
  updatePreferences,
} from "./service";

export default async function notificationsRoutes(app: FastifyInstance) {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/",
    {
      preHandler: [app.authenticate],
      schema: { response: { 200: z.array(notificationPublicSchema) } },
    },
    async (request, reply) => {
      const rows = await listNotifications(request.currentUser!.sub);
      return reply.send(rows.map(toPublicNotification));
    }
  );

  server.post(
    "/:id/read",
    { preHandler: [app.authenticate], schema: { params: z.object({ id: z.string() }) } },
    async (request, reply) => {
      await markNotificationRead(request.currentUser!.sub, request.params.id);
      return reply.status(204).send();
    }
  );

  server.post(
    "/read-all",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      await markAllNotificationsRead(request.currentUser!.sub);
      return reply.status(204).send();
    }
  );

  const preferencesSchema = z.object({ marketingOptIn: z.boolean(), phone: z.string().nullable() });

  server.get(
    "/preferences",
    { preHandler: [app.authenticate], schema: { response: { 200: preferencesSchema } } },
    async (request, reply) => {
      return reply.send(await getPreferences(request.currentUser!.sub));
    }
  );

  server.patch(
    "/preferences",
    {
      preHandler: [app.authenticate],
      schema: { body: updatePreferencesSchema, response: { 200: preferencesSchema } },
    },
    async (request, reply) => {
      return reply.send(await updatePreferences(request.currentUser!.sub, request.body));
    }
  );

  // Public one-click unsubscribe target for marketing-email links (no auth).
  server.get(
    "/unsubscribe",
    { schema: { querystring: z.object({ u: z.string(), t: z.string() }) } },
    async (request, reply) => {
      const ok = await unsubscribeByToken(request.query.u, request.query.t);
      reply.type("text/html");
      return reply.send(
        ok
          ? `<!doctype html><meta charset="utf-8"><title>Unsubscribed</title><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;text-align:center"><h1>You're unsubscribed</h1><p>You'll no longer receive marketing emails from Good Hours. Transactional emails (booking confirmations, receipts) will still be sent.</p></body>`
          : `<!doctype html><meta charset="utf-8"><title>Invalid link</title><body style="font-family:system-ui;max-width:32rem;margin:4rem auto;text-align:center"><h1>Link not valid</h1><p>This unsubscribe link is invalid or has expired.</p></body>`
      );
    }
  );

  // Admin-only: broadcast a marketing campaign announcing platform services.
  server.post(
    "/campaigns",
    {
      preHandler: [app.authenticate, app.requireRole(["ADMIN"])],
      schema: { body: campaignSchema, response: { 200: campaignResultSchema } },
    },
    async (request, reply) => {
      return reply.send(await sendCampaign(request.body));
    }
  );
}
