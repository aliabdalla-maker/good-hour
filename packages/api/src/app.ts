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
import crmModule from "./modules/crm";
import erpModule from "./modules/erp";
import creditsModule from "./modules/credits";
import walletModule from "./modules/wallet";
import marketplaceModule from "./modules/marketplace";
import auctionsModule from "./modules/auctions";

/** Process start, so /health also shows whether a restart has just happened. */
const bootedAt = new Date().toISOString();

export function buildApp() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "development" ? "info" : "warn",
    },
    // Fastify's 1MB default would silently reject a data:image/ room photo
    // before Zod even runs — a generated image's base64 payload routinely
    // exceeds that. Matches the imageUrl cap in listings.ts with headroom
    // for the rest of the JSON body.
    bodyLimit: 5 * 1024 * 1024,
    // Behind Render's proxy every request arrives from the proxy's address, so
    // without this the rate limiter keyed all traffic on one bucket: a single
    // client at 100 req/min could 429 every other user, and 10 bad logins from
    // anywhere locked out logins globally.
    trustProxy: true,
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

  /**
   * Health, plus the commit the running process was built from.
   *
   * The commit is here for a specific reason. To check whether a security fix had
   * reached production, a verification loop polled /auth/register with
   * role: "ADMIN" and watched for the 201 to turn into a 400. Before the deploy
   * landed, four of those polls succeeded — creating four real ADMIN accounts with
   * a known password on the live database.
   *
   * A probe for "is this hole closed?" must never take the action the hole
   * permits. Comparing this SHA against the deployed commit answers the same
   * question and cannot change any state. Anything that needs to know whether a
   * fix is live reads this, not the vulnerable endpoint.
   */
  app.get("/health", async () => ({
    status: "ok",
    // Render injects RENDER_GIT_COMMIT; GIT_COMMIT covers Docker/Compose builds.
    commit: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? "unknown",
    startedAt: bootedAt,
  }));
  // Friendly root so anyone browsing to the bare API origin sees a pointer
  // instead of a raw 404 (there's no UI here — the web app is the frontend).
  app.get("/", async () => ({
    name: "Good Hours API",
    status: "ok",
    health: "/health",
    web: config.WEB_ORIGIN.split(",")[0]?.trim(),
  }));

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
  app.register(crmModule);
  app.register(erpModule);
  app.register(creditsModule);
  app.register(walletModule);
  app.register(marketplaceModule);
  app.register(auctionsModule);

  // NB: domain-event handlers (notifications) are registered and drained in the
  // worker via the transactional outbox — not in-process here. The api only
  // *publishes* events (writes outbox rows).

  return app;
}
