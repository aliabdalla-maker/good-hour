import { getOpenAIClient, OPENAI_MODEL } from "../../lib/openaiClient";
import type { ErpOverview } from "@gihtcx/shared";

const INSIGHTS_TOOL = {
  type: "function" as const,
  function: {
    name: "erp_insights",
    description:
      "Summarize the marketplace's current operational/financial state and give actionable recommendations.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "2-3 sentence plain-English summary of the business's current state, referencing real numbers from the data given.",
        },
        recommendations: {
          type: "array",
          items: { type: "string" },
          description: "3-5 short, concrete, actionable recommendations for the owner-operator, each grounded in the data given.",
        },
      },
      required: ["summary", "recommendations"],
      additionalProperties: false,
    },
  },
};

type InsightsSourceData = Omit<ErpOverview, "aiInsights" | "generatedAt">;

function buildPrompt(data: InsightsSourceData): string {
  return [
    "Current Good Hours marketplace snapshot (JSON):",
    JSON.stringify(data),
    "",
    "Analyse this as an operations analyst would. Be specific to these numbers -- never generic filler.",
  ].join("\n");
}

const FALLBACK: ErpOverview["aiInsights"] = {
  summary: "AI insights are unavailable right now -- showing raw metrics only.",
  recommendations: [],
  generatedBy: "fallback",
};

/**
 * The one place the ERP module calls an LLM: turns the same aggregated
 * numbers already shown in the dashboard into a narrative summary + concrete
 * recommendations, same "structured tool-call, fallback on failure/timeout"
 * pattern as the pricing and negotiation agents. Not logged to
 * AgentDecisionLog -- this has no accept/reject outcome to track, unlike a
 * pricing or matching decision.
 */
export async function generateAiInsights(data: InsightsSourceData): Promise<ErpOverview["aiInsights"]> {
  try {
    const client = getOpenAIClient();
    const response = await Promise.race([
      client.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are the owner-operator's AI ops analyst for Good Hours, an hourly rooms/cars/travel marketplace with reverse-bidding and autonomous pricing/negotiation agents.",
          },
          { role: "user", content: buildPrompt(data) },
        ],
        tools: [INSIGHTS_TOOL],
        tool_choice: { type: "function", function: { name: "erp_insights" } },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("erp insights timeout")), 8000)),
    ]);

    const toolCall = response.choices[0]?.message.tool_calls?.[0];
    if (!toolCall || toolCall.type !== "function") throw new Error("erp insights: no tool call returned");

    const parsed = JSON.parse(toolCall.function.arguments) as {
      summary: string;
      recommendations: string[];
    };
    return { summary: parsed.summary, recommendations: parsed.recommendations, generatedBy: response.model };
  } catch {
    return FALLBACK;
  }
}
