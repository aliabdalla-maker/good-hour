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
- Never invent listings, prices or ids — only use what search_listings or get_my_bookings return.
- If the user has picked a specific listing (from search_listings) and a specific start/end time, call
  "propose_booking" instead of "navigate" — it pre-fills the booking form so they just have to confirm and
  pay. Always use a roomId that came from search_listings, and a start/end time the user actually gave you.
- You can look up and discuss the signed-in user's own bookings (get_my_bookings), but you can never
  take a payment or complete a booking yourself — "propose_booking" only pre-fills a form the user must
  still explicitly confirm. You are never the one that moves money.`;

const BASE_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
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
  {
    type: "function",
    function: {
      name: "propose_booking",
      description:
        "Pre-fill the booking form for a specific room and time so the user only has to review and confirm. " +
        "Does NOT create a booking or charge anything — the user still clicks 'Book & continue to payment' themselves.",
      parameters: {
        type: "object",
        properties: {
          roomId: { type: "string", description: "A roomId returned by search_listings" },
          startsAt: { type: "string", description: "ISO 8601 datetime for the start of the booking" },
          endsAt: { type: "string", description: "ISO 8601 datetime for the end of the booking" },
        },
        required: ["roomId", "startsAt", "endsAt"],
      },
    },
  },
];

// Only offered to the model when the request carries a valid session — the
// model can never call a tool that isn't in this list, so an unauthenticated
// chat can never even attempt to look up someone's bookings.
const AUTH_TOOLS: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_my_bookings",
      description: "Look up the signed-in user's own recent bookings and their status.",
      parameters: { type: "object", properties: {} },
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

async function getMyBookings(userId: string) {
  const bookings = await prisma.booking.findMany({
    where: { travellerId: userId },
    include: { room: true },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  return {
    bookings: bookings.map((b) => ({
      bookingId: b.id,
      itemName: b.room.name,
      status: b.status,
      startsAt: b.startsAt.toISOString(),
      currency: b.currency,
      totalAmount: Number(b.totalAmount),
    })),
  };
}

/**
 * Never books anything itself -- just validates the room is real/active and
 * the time range is sane, then pushes a "propose_booking" action for the
 * frontend to pre-fill. The actual booking write still requires the user to
 * submit the real booking form.
 */
async function proposeBooking(args: { roomId?: unknown; startsAt?: unknown; endsAt?: unknown }, actions: AssistantAction[]) {
  const roomId = String(args.roomId ?? "");
  const start = new Date(String(args.startsAt ?? ""));
  const end = new Date(String(args.endsAt ?? ""));
  if (!roomId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { error: "roomId, and a valid startsAt/endsAt where endsAt is after startsAt, are required" };
  }

  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { id: true, name: true, status: true } });
  if (!room || room.status !== "ACTIVE") {
    return { error: "room not found or no longer active" };
  }

  actions.push({
    type: "propose_booking",
    roomId: room.id,
    roomName: room.name,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    label: `Review booking: ${room.name}`,
  });
  return { ok: true, note: "Proposed to the user — they still need to confirm and pay on the booking page." };
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  actions: AssistantAction[],
  userId: string | null
) {
  if (name === "search_listings") {
    return { listings: await searchListings(args) };
  }
  if (name === "get_my_bookings") {
    // Belt-and-braces: even though this tool is only offered when userId is
    // set, never trust that alone — refuse if it's somehow missing.
    if (!userId) return { error: "not signed in" };
    return getMyBookings(userId);
  }
  if (name === "navigate") {
    const path = String(args.path ?? "/browse");
    const label = String(args.label ?? "Open");
    if (path.startsWith("/")) actions.push({ type: "navigate", path, label });
    return { ok: true };
  }
  if (name === "propose_booking") {
    return proposeBooking(args, actions);
  }
  return { error: "unknown tool" };
}

/** Agentic loop: the model can call tools (search / navigate / get_my_bookings) before replying. */
export async function chatWithAssistant(
  input: AssistantChatInput,
  userId: string | null = null
): Promise<AssistantReply> {
  if (!featureFlags.aiNegotiationEnabled) return fallbackReply(input, userId);

  try {
    const client = getOpenAIClient();
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(input.pageContext ? [{ role: "system" as const, content: `The user is currently on: ${input.pageContext}` }] : []),
      ...(userId ? [{ role: "system" as const, content: "The user is signed in — get_my_bookings is available." }] : []),
      ...input.messages,
    ];
    const actions: AssistantAction[] = [];
    const tools = userId ? [...BASE_TOOLS, ...AUTH_TOOLS] : BASE_TOOLS;

    for (let step = 0; step < 3; step++) {
      const res = await client.chat.completions.create({
        model: OPENAI_MODEL,
        messages,
        tools,
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
        const result = await runTool(tc.function.name, parsed, actions, userId);
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
  } catch (error) {
    // Never fail silently -- this was previously swallowed with no trace,
    // making an exhausted/invalid OpenAI key indistinguishable from normal
    // fallback behaviour. Log where it actually happened.
    console.error("[assistant] OpenAI call failed, falling back:", error instanceof Error ? error.message : error);
    return fallbackReply(input, userId);
  }
}

/** Offline keyword helper so the assistant still works without an OpenAI key. */
async function fallbackReply(input: AssistantChatInput, userId: string | null): Promise<AssistantReply> {
  const last = [...input.messages].reverse().find((m) => m.role === "user")?.content.toLowerCase() ?? "";
  const actions: AssistantAction[] = [];
  let reply: string;

  if (userId && /(my booking|my order|booking status|have i booked)/.test(last)) {
    const { bookings } = await getMyBookings(userId);
    if (bookings.length === 0) {
      reply = "You don't have any bookings yet — want to find something to book?";
      actions.push({ type: "navigate", path: "/browse", label: "Browse listings" });
    } else {
      const b = bookings[0];
      reply = `Your most recent booking: ${b.itemName} — ${b.status} — ${b.currency} ${b.totalAmount.toFixed(2)}. You have ${bookings.length} booking(s) on file.`;
      actions.push({ type: "navigate", path: "/dashboard/traveller", label: "View all my bookings" });
    }
  } else if (/(car|drive|vehicle|rental)/.test(last)) {
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
