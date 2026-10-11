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
