import OpenAI from "openai";
import { config } from "../config";

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!config.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  if (!client) {
    client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  }
  return client;
}

export const OPENAI_MODEL = config.OPENAI_MODEL;
