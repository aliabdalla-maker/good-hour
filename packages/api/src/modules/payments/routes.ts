import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../plugins/errorHandler";
import { simulatePaymentSucceeded } from "./service";
import { constructWebhookEvent, handleWebhookEvent } from "./webhookHandler";
import { config, featureFlags } from "../../config";
import { getBookingForViewer } from "../booking";

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
      // Never reachable in production, whatever the Stripe config says. Before
      // this, a single missing STRIPE_SECRET_KEY turned "confirm any booking
      // without paying" into a live, authenticated endpoint.
      if (config.NODE_ENV === "production") {
        throw new AppError(404, "Not found", "NOT_FOUND");
      }
      if (featureFlags.paymentsEnabled) {
        throw new AppError(
          400,
          "Stripe is configured -- use a real test-mode payment instead of the simulator",
          "SIMULATION_DISABLED"
        );
      }
      // Ownership check: this confirms a booking and promotes its slots, so it
      // must not work on someone else's booking even in development.
      const { bookingId } = request.params as { bookingId: string };
      await getBookingForViewer(bookingId, request.currentUser!.sub);
      await simulatePaymentSucceeded(bookingId);
      return reply.status(204).send();
    }
  );
}
