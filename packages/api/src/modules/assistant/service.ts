import type OpenAI from "openai";
import { prisma } from "@gihtcx/db";
import type { AssistantChatInput, AssistantReply, AssistantAction } from "@gihtcx/shared";
import { featureFlags } from "../../config";
import { getOpenAIClient, OPENAI_MODEL } from "../../lib/openaiClient";

const SYSTEM_PROMPT = `You are the Good Hours assistant — a friendly, concise concierge for an hourly marketplace.
Good Hours lets travellers book ROOMS, CARS and TRAVEL SERVICES by the hour from verified hosts.
Two booking modes: (1) "Book instantly" — search by city & time and pay now; (2) "Request a match" —
post what you need and suppliers + their AI agents bid for you (reverse auction). A 1% platform fee is
charged to the traveller and 1% to the host. Hosts get a "Verified" badge after admin approval; travellers
can review confirmed bookings.

Guidelines:
- Be brief and helpful (2-4 sentences). Use the tools to look things up rather than guessing.
- When recommending a specific listing or a section of the app, call the "navigate" tool so the user gets a button.
- Valid navigate paths: /browse, /search, /requests/new, /dashboard/traveller, /dashboard/supplier,
  /notifications, /login, /register, and /room/<id> for a specific listing (use ids from search_listings).
- Never invent listings, prices or ids — only use what search_listings returns.`;

const TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_listings",
      description: "Search the public catalogue of bookable listings (rooms, cars, travel services).",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["ROOM", "CAR", "TRAVEL_SERVICE"] },
          city: { type: "string", description: "City name, e.g. London" },
          maxHourlyRate: { type: "number", description: "Only listings at or below this per-hour rate" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate",
      description: "Offer the user a button that takes them to a page in the app.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Internal path, e.g. /search or /room/<id>" },
          label: { type: "string", description: "Short button label, e.g. 'Book instantly'" },
        },
        required: ["path", "label"],
      },
    },
  },
];

async function searchListings(args: { category?: string; city?: string; maxHourlyRate?: number }) {
  const properties = await prisma.property.findMany({
    where: {
      ...(args.category ? { category: args.category as "ROOM" | "CAR" | "TRAVEL_SERVICE" } : {}),
      ...(args.city ? { city: { equals: args.city, mode: "insensitive" } } : {}),
      rooms: { some: { status: "ACTIVE" } },
    },
    include: { rooms: { where: { status: "ACTIVE" } } },
    take: 10,
  });
  const rows = properties.flatMap((p) =>
    p.rooms
      .filter((r) => args.maxHourlyRate == null || Number(r.baseHourlyRate) <= args.maxHourlyRate)
      .map((r) => ({
        roomId: r.id,
        name: r.name,
        category: p.category,
        host: p.name,
        city: p.city,
        currency: r.currency,
        hourlyRate: Number(r.baseHourlyRate),
      }))
  );
  return rows.slice(0, 8);
}

async function runTool(name: string, args: Record<string, unknown>, actions: AssistantAction[]) {
  if (name === "search_listings") {
    return { listings: await searchListings(args) };
  }
  if (name === "navigate") {
    const path = String(args.path ?? "/browse");
    const label = String(args.label ?? "Open");
    if (path.startsWith("/")) actions.push({ type: "navigate", path, label });
    return { ok: true };
  }
  return { error: "unknown tool" };
}

/** Agentic loop: the model can call tools (search / navigate) before replying. */
export async function chatWithAssistant(input: AssistantChatInput): Promise<AssistantReply> {
  if (!featureFlags.aiNegotiationEnabled) return fallbackReply(input);

  try {
    const client = getOpenAIClient();
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(input.pageContext ? [{ role: "system" as const, content: `The user is currently on: ${input.pageContext}` }] : []),
      ...input.messages,
    ];
    const actions: AssistantAction[] = [];

    for (let step = 0; step < 3; step++) {
      const res = await client.chat.completions.create({
        model: OPENAI_MODEL,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 500,
      });
      const msg = res.choices[0]?.message;
      if (!msg) break;
      messages.push(msg);

      if (!msg.tool_calls?.length) {
        return { reply: msg.content ?? "How can I help?", actions, aiPowered: true };
      }
      for (const tc of msg.tool_calls) {
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(tc.function.arguments || "{}");
        } catch {
          parsed = {};
        }
        const result = await runTool(tc.function.name, parsed, actions);
        messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
      }
    }
    // Exhausted tool steps — ask once more for a plain answer.
    const finalRes = await client.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 400,
    });
    return {
      reply: finalRes.choices[0]?.message?.content ?? "Here's what I found — let me know what else you need.",
      actions,
      aiPowered: true,
    };
  } catch {
    return fallbackReply(input);
  }
}

/** Offline keyword helper so the assistant still works without an OpenAI key. */
function fallbackReply(input: AssistantChatInput): AssistantReply {
  const last = [...input.messages].reverse().find((m) => m.role === "user")?.content.toLowerCase() ?? "";
  const actions: AssistantAction[] = [];
  let reply: string;

  if (/(car|drive|vehicle|rental)/.test(last)) {
    reply = "You can rent cars by the hour on Good Hours. Browse the Cars category to see what's available.";
    actions.push({ type: "navigate", path: "/browse", label: "Browse cars & more" });
  } else if (/(host|list|sell|supplier|earn)/.test(last)) {
    reply = "Hosts list rooms, cars or services and earn from hourly bookings. Head to your supplier dashboard to add a listing and get verified.";
    actions.push({ type: "navigate", path: "/dashboard/supplier", label: "Supplier dashboard" });
  } else if (/(bid|auction|request|match)/.test(last)) {
    reply = "Post what you need and let hosts (and their AI agents) bid for your booking in a reverse auction.";
    actions.push({ type: "navigate", path: "/requests/new", label: "Request a match" });
  } else if (/(book|search|room|stay|travel|find)/.test(last)) {
    reply = "Search by city and time to book instantly, or browse everything on offer.";
    actions.push({ type: "navigate", path: "/search", label: "Book instantly" });
    actions.push({ type: "navigate", path: "/browse", label: "Browse all" });
  } else {
    reply = "I'm the Good Hours assistant. I can help you book rooms, cars and travel by the hour, or list your own. What are you looking for?";
    actions.push({ type: "navigate", path: "/browse", label: "Start browsing" });
  }
  return { reply, actions, aiPowered: false };
}
