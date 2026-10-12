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

// API keys pasted over SSH can pick up terminal escape sequences (bracketed
// paste "ESC[200~ ... ESC[201~", arrow keys), quotes or invisible Unicode.
// Any non-printable character makes Node's fetch reject the Authorization
// header ("Connection error."), so strip them, and if a well-formed key is
// buried in the noise, use it (the last one: the most recent paste).
const KEY_PATTERNS = [
  /sk-or-v1-[0-9a-f]{64}(?![0-9a-z])/g, // OpenRouter
  /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/g, // OpenAI
  /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}/g, // Stripe secret / restricted
  /whsec_[A-Za-z0-9]{20,}/g, // Stripe webhook secret
];
export function cleanSecret(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const noAnsi = raw.replace(/\x1b\[[0-9;?]*[~A-Za-z]/g, "").replace(/\[(?:200|201)~/g, "");
  for (const re of KEY_PATTERNS) {
    const found = noAnsi.match(re);
    if (found && found.length) return found[found.length - 1];
  }
  return noAnsi.replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, "").replace(/[^\x21-\x7E]/g, "");
}
const optionalSecret = () =>
  z
    .string()
    .transform((v) => cleanSecret(v))
    .optional();

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
  OPENAI_API_KEY: optionalSecret(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  // Points the OpenAI SDK at an OpenAI-compatible endpoint instead (e.g.
  // Groq's https://api.groq.com/openai/v1) -- unset uses OpenAI itself.
  OPENAI_BASE_URL: optionalTrimmed(),
  STRIPE_SECRET_KEY: optionalSecret(),
  STRIPE_WEBHOOK_SECRET: optionalSecret(),
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
  /**
   * Whether the platform holds a spendable float — wallet top-ups and time-credit
   * purchases — as opposed to passing card payments straight through to a booking.
   *
   * This is the switch that decouples going live from CR-001. The float and the
   * transferable credits are what make the e-money question hard; direct card ->
   * booking is much closer to payment pass-through. Setting
   * WALLET_FLOAT_ENABLED=false lets you take real bookings while that determination
   * is still outstanding.
   *
   * Defaults to ENABLED, deliberately: flipping it by default would silently remove
   * working features from a live site. Set it explicitly when you decide to.
   */
  walletFloatEnabled: process.env.WALLET_FLOAT_ENABLED !== "false",
  aiPricingEnabled: Boolean(config.OPENAI_API_KEY),
  aiNegotiationEnabled: Boolean(config.OPENAI_API_KEY),
  paymentsEnabled: Boolean(config.STRIPE_SECRET_KEY),
  smoobuEnabled: Boolean(config.SMOOBU_API_KEY && config.SMOOBU_API_SECRET),
  emailEnabled: Boolean(config.RESEND_API_KEY),
  smsEnabled: Boolean(
    config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.TWILIO_FROM_NUMBER
  ),
};
