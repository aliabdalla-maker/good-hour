import { pricingDecisionSchema, type PricingAgentInput, type PricingDecision } from "@gihtcx/shared";
import { getOpenAIClient, OPENAI_MODEL } from "../../lib/openaiClient";
import { logAgentDecision } from "../agent-log";
import { PRICING_PROMPT_VERSION, PRICING_SYSTEM_PROMPT, buildPricingUserPrompt } from "./prompt";
import { RECOMMEND_RATE_TOOL } from "./schema";
import { buildPricingInputForRoom } from "./signals";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function fallbackDecision(input: PricingAgentInput): PricingDecision {
  return {
    recommendedHourlyRate: clamp(input.baseHourlyRate, input.constraints.minRate, input.constraints.maxRate),
    rateMultiplier: 1,
    reasoning: "Fallback: static base rate used because the pricing agent was unavailable or timed out.",
    confidence: "low",
  };
}

async function callOpenAI(input: PricingAgentInput) {
  const client = getOpenAIClient();
  const started = Date.now();

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: PRICING_SYSTEM_PROMPT },
      { role: "user", content: buildPricingUserPrompt(input) },
    ],
    tools: [RECOMMEND_RATE_TOOL],
    tool_choice: { type: "function", function: { name: "recommend_rate" } },
  });

  const latencyMs = Date.now() - started;
  const toolCall = response.choices[0]?.message.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("Pricing agent did not return a tool call");
  }

  const parsedArgs = JSON.parse(toolCall.function.arguments);
  const decision = pricingDecisionSchema.parse(parsedArgs);

  return { decision, latencyMs, rawResponse: response };
}

export interface RecommendRateOptions {
  timeoutMs?: number;
}

/**
 * Only exported entry point of this module -- nothing else in the codebase
 * is allowed to call OpenAI for pricing, so every rate recommendation is
 * guaranteed to produce an AgentDecisionLog row.
 */
export async function recommendRate(
  input: PricingAgentInput,
  options: RecommendRateOptions = {}
): Promise<PricingDecision> {
  const timeoutMs = options.timeoutMs ?? 3000;

  try {
    const result = await Promise.race([
      callOpenAI(input),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("pricing agent timeout")), timeoutMs)
      ),
    ]);

    const clamped: PricingDecision = {
      ...result.decision,
      recommendedHourlyRate: clamp(
        result.decision.recommendedHourlyRate,
        input.constraints.minRate,
        input.constraints.maxRate
      ),
    };

    await logAgentDecision({
      agentType: "PRICING",
      subjectType: "Room",
      subjectId: input.roomId,
      inputSnapshot: input,
      promptVersion: PRICING_PROMPT_VERSION,
      modelUsed: result.rawResponse.model,
      rawModelOutput: result.rawResponse,
      parsedDecision: clamped,
      reasoning: clamped.reasoning,
      latencyMs: result.latencyMs,
    });

    return clamped;
  } catch (error) {
    const fallback = fallbackDecision(input);
    await logAgentDecision({
      agentType: "PRICING",
      subjectType: "Room",
      subjectId: input.roomId,
      inputSnapshot: input,
      promptVersion: PRICING_PROMPT_VERSION,
      modelUsed: "fallback-static-rate",
      rawModelOutput: { error: error instanceof Error ? error.message : String(error) },
      parsedDecision: fallback,
      reasoning: fallback.reasoning,
      latencyMs: timeoutMs,
    });
    return fallback;
  }
}

/** Convenience wrapper used by search/routes and the room-detail UI. */
export async function getSuggestedRateForRoom(roomId: string): Promise<PricingDecision> {
  const input = await buildPricingInputForRoom(roomId);
  return recommendRate(input);
}
