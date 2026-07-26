import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { config } from "./config";
import { registerErrorHandler } from "./plugins/errorHandler";
import authGuardPlugin from "./plugins/authGuard";
import authModule from "./modules/auth";
import listingsModule from "./modules/listings";
import searchModule from "./modules/search";
import bookingModule from "./modules/booking";
import biddingModule from "./modules/bidding";
import paymentsModule from "./modules/payments";
import pricingAgentModule from "./modules/pricing-agent";
import notificationsModule from "./modules/notifications";
import sourcingModule from "./modules/sourcing";
import reviewsModule from "./modules/reviews";
import verificationModule from "./modules/verification";
import messagesModule from "./modules/messages";
import assistantModule from "./modules/assistant";

export function buildApp() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "development" ? "info" : "warn",
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerErrorHandler(app);

  // Only allow the configured web origin(s) to make credentialed requests
  // (prevents any site from issuing authenticated calls on a user's behalf).
  const allowedOrigins = config.WEB_ORIGIN.split(",").map((o) => o.trim());
  app.register(cors, { origin: allowedOrigins, credentials: true });
  app.register(cookie);
  app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  app.register(authGuardPlugin);

  app.get("/health", async () => ({ status: "ok" }));

  app.register(authModule);
  app.register(listingsModule);
  app.register(searchModule, { prefix: "/search" });
  app.register(bookingModule);
  app.register(biddingModule);
  app.register(paymentsModule);
  app.register(pricingAgentModule);
  app.register(notificationsModule);
  app.register(sourcingModule);
  app.register(reviewsModule);
  app.register(verificationModule);
  app.register(messagesModule);
  app.register(assistantModule);

  // NB: domain-event handlers (notifications) are registered and drained in the
  // worker via the transactional outbox — not in-process here. The api only
  // *publishes* events (writes outbox rows).

  return app;
}
