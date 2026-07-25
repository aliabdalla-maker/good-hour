import { matchDecisionSchema, type MatchDecision, type NegotiationAgentInput } from "@gihtcx/shared";
import { getOpenAIClient, OPENAI_MODEL } from "../../lib/openaiClient";
import { logAgentDecision } from "../agent-log";
import { NEGOTIATION_PROMPT_VERSION, NEGOTIATION_SYSTEM_PROMPT, buildNegotiationUserPrompt } from "./prompt";
import { EVALUATE_OFFERS_TOOL } from "./schema";

function fallbackDecision(input: NegotiationAgentInput): MatchDecision {
  const ranked = [...input.offers].sort((a, b) => a.offeredTotal - b.offeredTotal);
  return {
    recommendedOfferId: ranked[0]?.offerId ?? "",
    rankedOfferIds: ranked.map((o) => o.offerId),
    reasoning: "Fallback: ranked by lowest total price because the negotiation agent was unavailable or timed out.",
    perOfferScore: ranked.map((o, i) => ({
      offerId: o.offerId,
      score: Math.max(0, 100 - i * 10),
      notes: "Ranked by price only (fallback mode)",
    })),
  };
}

/** Ensures the model's ranking only ever references offers that were actually submitted. */
function sanitizeDecision(decision: MatchDecision, input: NegotiationAgentInput): MatchDecision {
  const validIds = new Set(input.offers.map((o) => o.offerId));
  const rankedOfferIds = decision.rankedOfferIds.filter((id) => validIds.has(id));
  for (const id of validIds) {
    if (!rankedOfferIds.includes(id)) rankedOfferIds.push(id);
  }
  const recommendedOfferId = validIds.has(decision.recommendedOfferId)
    ? decision.recommendedOfferId
    : rankedOfferIds[0];

  return { ...decision, recommendedOfferId, rankedOfferIds };
}

async function callOpenAI(input: NegotiationAgentInput) {
  const client = getOpenAIClient();
  const started = Date.now();

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: NEGOTIATION_SYSTEM_PROMPT },
      { role: "user", content: buildNegotiationUserPrompt(input) },
    ],
    tools: [EVALUATE_OFFERS_TOOL],
    tool_choice: { type: "function", function: { name: "evaluate_offers" } },
  });

  const latencyMs = Date.now() - started;
  const toolCall = response.choices[0]?.message.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") {
    throw new Error("Negotiation agent did not return a tool call");
  }

  const parsedArgs = JSON.parse(toolCall.function.arguments);
  const decision = matchDecisionSchema.parse(parsedArgs);

  return { decision, latencyMs, rawResponse: response };
}

export interface EvaluateOffersOptions {
  timeoutMs?: number;
  bookingRequestId: string;
}

/**
 * Only exported entry point of this module -- nothing else is allowed to
 * call OpenAI for negotiation, so every match recommendation is
 * guaranteed to produce an AgentDecisionLog row.
 */
export async function evaluateOffers(
  input: NegotiationAgentInput,
  options: EvaluateOffersOptions
): Promise<MatchDecision> {
  const timeoutMs = options.timeoutMs ?? 8000;

  if (input.offers.length === 0) {
    throw new Error("Cannot evaluate offers: no offers submitted yet");
  }

  try {
    const result = await Promise.race([
      callOpenAI(input),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("negotiation agent timeout")), timeoutMs)
      ),
    ]);

    const sanitized = sanitizeDecision(result.decision, input);

    await logAgentDecision({
      agentType: "NEGOTIATION",
      subjectType: "BookingRequest",
      subjectId: options.bookingRequestId,
      inputSnapshot: input,
      promptVersion: NEGOTIATION_PROMPT_VERSION,
      modelUsed: result.rawResponse.model,
      rawModelOutput: result.rawResponse,
      parsedDecision: sanitized,
      reasoning: sanitized.reasoning,
      latencyMs: result.latencyMs,
    });

    return sanitized;
  } catch (error) {
    const fallback = fallbackDecision(input);
    await logAgentDecision({
      agentType: "NEGOTIATION",
      subjectType: "BookingRequest",
      subjectId: options.bookingRequestId,
      inputSnapshot: input,
      promptVersion: NEGOTIATION_PROMPT_VERSION,
      modelUsed: "fallback-lowest-price",
      rawModelOutput: { error: error instanceof Error ? error.message : String(error) },
      parsedDecision: fallback,
      reasoning: fallback.reasoning,
      latencyMs: timeoutMs,
    });
    return fallback;
  }
}
