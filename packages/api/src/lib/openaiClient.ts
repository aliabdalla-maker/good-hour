import OpenAI from "openai";
import { config } from "../config";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!config.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!client) {
    // OpenRouter identifies the calling app from these headers (optional for
    // OpenAI itself, recommended by OpenRouter for attribution and limits).
    const isOpenRouter = (config.OPENAI_BASE_URL ?? "").includes("openrouter.ai");
    client = new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      baseURL: config.OPENAI_BASE_URL,
      defaultHeaders: isOpenRouter ? { "HTTP-Referer": config.WEB_ORIGIN, "X-Title": "Good Hours" } : undefined,
    });
  }
  return client;
}

export const OPENAI_MODEL = config.OPENAI_MODEL;

/**
 * Last AI-provider failure, kept in memory so /health/ready can say WHY the
 * assistant fell back without anyone needing server log access. Only the
 * error category, HTTP status and a short provider message are kept; the
 * message is scrubbed of anything that looks like a key.
 */
export interface AiErrorSummary {
  at: string;
  kind: "invalid_key" | "no_credit" | "rate_limited" | "model_not_found" | "bad_request" | "network" | "other";
  status: number | null;
  message: string;
}

let lastAiError: AiErrorSummary | null = null;
let lastAiSuccessAt: string | null = null;

export function recordAiError(error: unknown): void {
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : null;
  // The OpenAI SDK reports every transport failure as "Connection error." and
  // keeps the real reason (DNS, TLS, refused, bad header) on error.cause.
  const causes: string[] = [];
  let c: unknown = (error as { cause?: unknown })?.cause;
  for (let i = 0; c && i < 3; i++) {
    const e = c as { code?: unknown; message?: unknown; cause?: unknown };
    causes.push([e.code, e.message].filter((x) => typeof x === "string" && x).join(" "));
    c = e.cause;
  }
  const base = error instanceof Error ? error.message : String(error);
  const raw = [base, ...causes.filter(Boolean)].join(" | ");
  const message = raw.replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-***").replace(/Bearer\s+\S+/gi, "Bearer ***").slice(0, 300);
  const kind: AiErrorSummary["kind"] =
    status === 401 || status === 403 ? "invalid_key"
    : status === 402 ? "no_credit"
    : status === 429 ? "rate_limited"
    : status === 404 ? "model_not_found"
    : status === 400 || status === 422 ? "bad_request"
    : status === null && /connection error|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|CERT|network/i.test(raw) ? "network"
    : "other";
  lastAiError = { at: new Date().toISOString(), kind, status, message };
}

export function recordAiSuccess(): void {
  lastAiSuccessAt = new Date().toISOString();
}

export function getAiStatus() {
  return { lastError: lastAiError, lastSuccessAt: lastAiSuccessAt };
}
