import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../plugins/errorHandler";
import { simulatePaymentSucceeded } from "./service";
import { constructWebhookEvent, handleWebhookEvent } from "./webhookHandler";
import { featureFlags } from "../../config";

export default async function paymentsRoutes(app: FastifyInstance) {
  // Scoped to this plugin only (Fastify plugin encapsulation): Stripe needs
  // the exact raw request bytes to verify the webhook signature, so this
  // route captures the raw buffer instead of using the app-wide JSON parser.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  app.post("/webhook", async (request, reply) => {
    const signature = request.headers["stripe-signature"];
    if (typeof signature !== "string") {
      throw new AppError(400, "Missing stripe-signature header", "MISSING_SIGNATURE");
    }
    const event = constructWebhookEvent(request.body as Buffer, signature);
    await handleWebhookEvent(event);
    return reply.status(200).send({ received: true });
  });

  app.post(
    "/:bookingId/simulate-succeeded",
    {
      preHandler: [app.authenticate],
      schema: { params: z.object({ bookingId: z.string() }) },
    },
    async (request, reply) => {
      if (featureFlags.paymentsEnabled) {
        throw new AppError(
          400,
          "Stripe is configured -- use a real test-mode payment instead of the simulator",
          "SIMULATION_DISABLED"
        );
      }
      await simulatePaymentSucceeded((request.params as { bookingId: string }).bookingId);
      return reply.status(204).send();
    }
  );
}
