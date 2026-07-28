import { prisma } from "@gihtcx/db";
import type { ExchangeQuote, ListingCategory } from "@gihtcx/shared";
import { BUYER_FEE_RATE } from "@gihtcx/shared";
import { getOpenAIClient, OPENAI_MODEL } from "../../lib/openaiClient";
import { logAgentDecision } from "../agent-log";

export const EXCHANGE_PROMPT_VERSION = "exchange-v1";

/**
 * How far the agent is allowed to move the rate away from the observed market
 * ratio. The market ratio is real money (live listing prices); the model's
 * adjustment is a judgement about demand. Letting it move more than this would
 * let a hallucinated number destroy real value in someone's wallet, so it is
 * clamped server-side regardless of what the model returns — the same rule the
 * pricing agent follows for host min/max.
 */
const MAX_ADJUSTMENT = 0.25;

const QUOTE_TOOL = {
  type: "function" as const,
  function: {
    name: "quote_exchange_rate",
    description:
      "Adjust a market-derived time-credit exchange rate for demand, scarcity and seasonality.",
    parameters: {
      type: "object",
      properties: {
        adjustmentFactor: {
          type: "number",
          description:
            "Multiplier applied to the market rate. 1.0 = accept the market rate. Must stay within 0.75-1.25.",
        },
        reasoning: {
          type: "string",
          description: "One or two sentences explaining the adjustment, referencing the supplied signals.",
        },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["adjustmentFactor", "reasoning", "confidence"],
      additionalProperties: false,
    },
  },
};

/** Mean hourly rate of active inventory per category — the money-anchored side of the quote. */
async function getMarketRates(): Promise<Record<string, { avgRate: number; activeRooms: number }>> {
  const rooms = await prisma.room.findMany({
    where: { status: "ACTIVE" },
    select: { baseHourlyRate: true, property: { select: { category: true } } },
  });

  const acc = new Map<string, { sum: number; n: number }>();
  for (const r of rooms) {
    const cat = r.property.category;
    const e = acc.get(cat) ?? { sum: 0, n: 0 };
    e.sum += Number(r.baseHourlyRate);
    e.n += 1;
    acc.set(cat, e);
  }

  const out: Record<string, { avgRate: number; activeRooms: number }> = {};
  for (const [cat, e] of acc) out[cat] = { avgRate: e.sum / e.n, activeRooms: e.n };
  return out;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Quotes how many destination-category hours a number of source-category hours
 * is worth.
 *
 * The rate is anchored on the ratio of real average listing prices, so an hour
 * of a £40/hr suite is worth more than an hour of a £10/hr van no matter what
 * the model says. The agent only nudges that anchor within ±25%.
 */
export async function quoteExchange(
  fromCategory: ListingCategory,
  toCategory: ListingCategory,
  hours: number
): Promise<ExchangeQuote> {
  const market = await getMarketRates();
  const fromRate = market[fromCategory]?.avgRate ?? 0;
  const toRate = market[toCategory]?.avgRate ?? 0;

  // Without real prices on both sides there is no defensible rate. Falling
  // back to 1:1 here would silently hand someone a windfall or rob them.
  if (fromRate <= 0 || toRate <= 0) {
    return {
      fromCategory,
      toCategory,
      hoursIn: hours,
      hoursOut: 0,
      feeHours: 0,
      rate: 0,
      reasoning:
        "No active listings on one side of this pair, so there is no market price to quote an exchange against.",
      confidence: "low",
      quotedBy: "unavailable",
    };
  }

  const marketRate = fromRate / toRate;
  const started = Date.now();

  let adjustment = 1;
  let reasoning = `Quoted directly from live listing prices (${fromCategory} avg ${fromRate.toFixed(2)}/hr vs ${toCategory} avg ${toRate.toFixed(2)}/hr).`;
  let confidence: ExchangeQuote["confidence"] = "medium";
  let quotedBy = "market-rate";
  let rawOutput: unknown = { note: "market-rate only, no model call" };

  const signals = {
    fromCategory,
    toCategory,
    hours,
    marketAvgHourlyRate: { [fromCategory]: round2(fromRate), [toCategory]: round2(toRate) },
    activeListings: {
      [fromCategory]: market[fromCategory]?.activeRooms ?? 0,
      [toCategory]: market[toCategory]?.activeRooms ?? 0,
    },
    marketRate: round2(marketRate),
  };

  try {
    const client = getOpenAIClient();
    const response = await Promise.race([
      client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You price time-credit exchanges on Good Hours, an hourly marketplace for rooms, cars and travel services. A time credit is one bookable hour in a category. Respect the market rate; adjust only for genuine demand or scarcity signals.",
          },
          { role: "user", content: JSON.stringify(signals) },
        ],
        tools: [QUOTE_TOOL],
        tool_choice: { type: "function", function: { name: "quote_exchange_rate" } },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("exchange agent timeout")), 4000)),
    ]);

    const toolCall = response.choices[0]?.message.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function") throw new Error("exchange agent returned no tool call");
    const parsed = JSON.parse(toolCall.function.arguments) as {
      adjustmentFactor: number;
      reasoning: string;
      confidence: ExchangeQuote["confidence"];
    };

    adjustment = clamp(Number(parsed.adjustmentFactor) || 1, 1 - MAX_ADJUSTMENT, 1 + MAX_ADJUSTMENT);
    reasoning = parsed.reasoning;
    confidence = parsed.confidence ?? "medium";
    quotedBy = response.model;
    rawOutput = response;
  } catch (error) {
    // Market rate alone is a perfectly good quote — the model is an
    // enhancement, not a dependency.
    rawOutput = { error: error instanceof Error ? error.message : String(error) };
    confidence = "low";
  }

  const effectiveRate = marketRate * adjustment;
  const grossOut = hours * effectiveRate;
  // Platform spread taken in destination hours (the "exchange commission").
  const feeHours = round2(grossOut * BUYER_FEE_RATE);
  const hoursOut = round2(grossOut - feeHours);

  const quote: ExchangeQuote = {
    fromCategory,
    toCategory,
    hoursIn: hours,
    hoursOut,
    feeHours,
    rate: round2(effectiveRate),
    reasoning,
    confidence,
    quotedBy,
  };

  await logAgentDecision({
    agentType: "EXCHANGE",
    subjectType: "CreditExchange",
    subjectId: `${fromCategory}->${toCategory}`,
    inputSnapshot: signals,
    promptVersion: EXCHANGE_PROMPT_VERSION,
    modelUsed: quotedBy === "market-rate" ? "fallback-market-rate" : quotedBy,
    rawModelOutput: rawOutput as Record<string, unknown>,
    parsedDecision: quote,
    reasoning: quote.reasoning,
    latencyMs: Date.now() - started,
  });

  return quote;
}
