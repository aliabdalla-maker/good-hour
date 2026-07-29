import type { AuctionKind } from "@gihtcx/shared";
// clampToMandate is shared so its guarantee — no model output can bid past the
// mandate — is asserted by a test rather than by the comment above it.
import { MIN_BID_INCREMENT, nextValidBid, clampToMandate } from "@gihtcx/shared";
import { getOpenAIClient, OPENAI_MODEL } from "../../lib/openaiClient";
import { logAgentDecision } from "../agent-log";

export const AUCTION_PROMPT_VERSION = "auction-v1";

export interface CounterBidDecision {
  /** Null means "hold" — deliberately let the rival lead. */
  amountPerHour: number | null;
  reasoning: string;
  confidence: "low" | "medium" | "high";
  decidedBy: string;
}

const COUNTER_TOOL = {
  type: "function" as const,
  function: {
    name: "decide_counter_bid",
    description:
      "Decide whether to counter-bid in an hourly auction, and at what per-hour price, staying within the mandate ceiling.",
    parameters: {
      type: "object",
      properties: {
        shouldBid: {
          type: "boolean",
          description: "False to hold and let the rival lead (e.g. the price has run past fair value).",
        },
        amountPerHour: {
          type: "number",
          description:
            "Per-hour price to bid. Ignored when shouldBid is false. Must respect the mandate ceiling.",
        },
        reasoning: { type: "string", description: "One or two sentences, referencing the numbers given." },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["shouldBid", "amountPerHour", "reasoning", "confidence"],
      additionalProperties: false,
    },
  },
};

export interface CounterBidInput {
  auctionId: string;
  kind: AuctionKind;
  title: string;
  category: string;
  hours: number;
  reservePerHour: number;
  leadingPerHour: number | null;
  /** The bidder's own mandate limit: max for FORWARD, min for REVERSE. */
  ceilingPerHour: number;
  bidCount: number;
  minutesRemaining: number;
  currency: string;
}

/**
 * Decides the agent's next move on behalf of one bidder.
 *
 * The safe, deterministic answer — bid the minimum increment needed to lead —
 * is always available, so the model is an optimiser rather than a dependency.
 * If it errors, times out, or has no key, the agent still bids correctly.
 */
export async function decideCounterBid(input: CounterBidInput): Promise<CounterBidDecision> {
  const started = Date.now();
  const fallbackAmount = clampToMandate(
    input.kind,
    nextValidBid(input.kind, input.reservePerHour, input.leadingPerHour),
    input.leadingPerHour,
    input.ceilingPerHour,
    input.reservePerHour
  );

  let decision: CounterBidDecision = {
    amountPerHour: fallbackAmount,
    reasoning:
      fallbackAmount === null
        ? "Holding: the leading bid is already past this mandate's limit."
        : `Bidding the minimum increment (${MIN_BID_INCREMENT}/hr) needed to take the lead within the mandate.`,
    confidence: "medium",
    decidedBy: "fallback-min-increment",
  };
  let raw: unknown = { note: "no model call" };

  try {
    const client = getOpenAIClient();
    const response = await Promise.race([
      client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You bid in hourly auctions on Good Hours on behalf of one participant. In a FORWARD auction you are buying and must not exceed the ceiling; in a REVERSE auction you are selling and must not go below the floor. Bidding the smallest increment that takes the lead is usually correct — only bid harder when time is nearly up or competition is heavy.",
          },
          { role: "user", content: JSON.stringify(input) },
        ],
        tools: [COUNTER_TOOL],
        tool_choice: { type: "function", function: { name: "decide_counter_bid" } },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("auction agent timeout")), 5000)),
    ]);

    const call = response.choices[0]?.message.tool_calls?.[0];
    if (!call || call.type !== "function") throw new Error("auction agent returned no tool call");
    const parsed = JSON.parse(call.function.arguments) as {
      shouldBid: boolean;
      amountPerHour: number;
      reasoning: string;
      confidence: CounterBidDecision["confidence"];
    };

    const clamped = parsed.shouldBid
      ? clampToMandate(
          input.kind,
          Number(parsed.amountPerHour),
          input.leadingPerHour,
          input.ceilingPerHour,
          input.reservePerHour
        )
      : null;

    decision = {
      amountPerHour: clamped,
      reasoning: parsed.reasoning,
      confidence: parsed.confidence ?? "medium",
      decidedBy: response.model,
    };
    raw = response;
  } catch (error) {
    raw = { error: error instanceof Error ? error.message : String(error) };
    decision.confidence = "low";
  }

  await logAgentDecision({
    agentType: "AUCTION",
    subjectType: "MarketplaceAuction",
    subjectId: input.auctionId,
    inputSnapshot: input,
    promptVersion: AUCTION_PROMPT_VERSION,
    modelUsed: decision.decidedBy,
    rawModelOutput: raw as Record<string, unknown>,
    parsedDecision: decision,
    reasoning: decision.reasoning,
    latencyMs: Date.now() - started,
  });

  return decision;
}
