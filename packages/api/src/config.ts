import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// The single source of truth is the repo-root .env. Load it explicitly
// (resolved from this file) so it's found no matter which workspace
// directory the api/worker process is launched from. Real env vars
// already present (e.g. injected by docker-compose) are not overridden.
loadDotenv({ path: path.resolve(__dirname, "../../../.env") });

// Dashboard env-var forms make it easy to paste in a
// trailing space or newline without noticing -- Stripe's SDK in particular
// rejects a whitespace-contaminated webhook secret outright. Trim every
// credential/secret value so a stray character from copy-pasting can't
// silently break signature verification or auth.
const trimmed = () => z.string().transform((v) => v.trim());
const optionalTrimmed = () => z.string().transform((v) => v.trim()).optional();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: trimmed().pipe(z.string().min(1, "DATABASE_URL is required")),
  REDIS_URL: trimmed().pipe(z.string().min(1, "REDIS_URL is required")),
  JWT_SECRET: trimmed().pipe(z.string().min(16, "JWT_SECRET must be at least 16 characters")),
  COOKIE_NAME: z.string().default("gihtcx_session"),
  // Comma-separated list of allowed browser origins for CORS (credentialed).
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  // Public base URL of this API, used to build unsubscribe links in emails.
  API_PUBLIC_URL: z.string().default("http://localhost:4000"),
  // Minutes an unpaid booking holds its slots before they're auto-released.
  RESERVATION_HOLD_MINUTES: z.coerce.number().int().positive().default(15),
  OPENAI_API_KEY: optionalTrimmed(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  // Points the OpenAI SDK at an OpenAI-compatible endpoint instead (e.g.
  // Groq's https://api.groq.com/openai/v1) -- unset uses OpenAI itself.
  OPENAI_BASE_URL: optionalTrimmed(),
  STRIPE_SECRET_KEY: optionalTrimmed(),
  STRIPE_WEBHOOK_SECRET: optionalTrimmed(),
  // Smoobu (vacation rental channel manager) HMAC API credentials, used to
  // import the platform's connected properties as review-before-publish
  // sourcing drafts, the same as a URL/feed import.
  SMOOBU_API_KEY: optionalTrimmed(),
  SMOOBU_API_SECRET: optionalTrimmed(),
  // --- Communication channels (all optional; fall back to console logging) ---
  RESEND_API_KEY: optionalTrimmed(),
  EMAIL_FROM: z.string().default("Good Hours <onboarding@resend.dev>"),
  TWILIO_ACCOUNT_SID: optionalTrimmed(),
  TWILIO_AUTH_TOKEN: optionalTrimmed(),
  TWILIO_FROM_NUMBER: optionalTrimmed(),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();

export const featureFlags = {
  aiPricingEnabled: Boolean(config.OPENAI_API_KEY),
  aiNegotiationEnabled: Boolean(config.OPENAI_API_KEY),
  paymentsEnabled: Boolean(config.STRIPE_SECRET_KEY),
  smoobuEnabled: Boolean(config.SMOOBU_API_KEY && config.SMOOBU_API_SECRET),
  emailEnabled: Boolean(config.RESEND_API_KEY),
  smsEnabled: Boolean(
    config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_FROM_NUMBER
  ),
};
