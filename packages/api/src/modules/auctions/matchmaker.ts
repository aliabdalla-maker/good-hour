import { prisma } from "@gihtcx/db";
import { z } from "zod";
import { getOpenAIClient, OPENAI_MODEL, recordAiError, recordAiSuccess } from "../../lib/openaiClient";

/**
 * Agentic helpers around hourly auctions:
 *
 *  - draftAuction: turns one plain-English sentence into a complete auction
 *    (title, description, category, hours, reserve), pricing the reserve from
 *    comparable listings in the live catalogue. Uses the LLM when available and
 *    a deterministic parser otherwise, so the feature never dead-ends.
 *  - findMatchingHosts: for a buyer's (REVERSE) auction, finds real hosts whose
 *    active listings fit the category and budget, so they can be invited to bid.
 *
 * Neither function bids or spends on anyone's behalf: bidding agents only act
 * under a mandate the bidder sets explicitly (see agent.ts).
 */

type ListingCategory = "ROOM" | "CAR" | "TRAVEL_SERVICE";

export const auctionDraftRequestSchema = z.object({
  prompt: z.string().trim().min(5).max(500),
  kind: z.enum(["FORWARD", "REVERSE"]).optional(),
});
export type AuctionDraftRequest = z.infer<typeof auctionDraftRequestSchema>;

export const auctionDraftSchema = z.object({
  kind: z.enum(["FORWARD", "REVERSE"]),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  hours: z.number(),
  reservePerHour: z.number(),
  durationMinutes: z.number(),
  comparables: z.object({ count: z.number(), medianPerHour: z.number().nullable() }),
  aiPowered: z.boolean(),
});
export type AuctionDraft = z.infer<typeof auctionDraftSchema>;

const CAR_WORDS = /\b(car|cars|van|vans|vehicle|drive|driver|chauffeur|hire|rental|ev|tesla|minibus)\b/i;
const TRAVEL_WORDS = /\b(travel|tour|tours|guide|guided|transfer|airport|walk|walking|excursion|trip|taxi|shuttle)\b/i;

/** Maps a free-text auction category or prompt onto a catalogue category. */
export function listingCategoryFor(text: string): ListingCategory {
  if (CAR_WORDS.test(text)) return "CAR";
  if (TRAVEL_WORDS.test(text)) return "TRAVEL_SERVICE";
  return "ROOM";
}

const CATEGORY_LABEL: Record<ListingCategory, string> = { ROOM: "rooms", CAR: "cars", TRAVEL_SERVICE: "travel" };
const DEFAULT_RATE: Record<ListingCategory, number> = { ROOM: 25, CAR: 15, TRAVEL_SERVICE: 30 };
const DURATIONS = [60, 360, 1440, 4320, 10080];

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const roundHalf = (n: number) => Math.max(0.5, Math.round(n * 2) / 2);
const roundQuarter = (n: number) => Math.min(10_000, Math.max(0.25, Math.round(n * 4) / 4));

async function comparableRates(
  category: ListingCategory,
  city: string | null
): Promise<{ count: number; medianPerHour: number | null }> {
  const rooms = await prisma.room.findMany({
    where: {
      status: "ACTIVE",
      property: { category, ...(city ? { city: { equals: city, mode: "insensitive" as const } } : {}) },
    },
    select: { baseHourlyRate: true },
    take: 200,
  });
  const rates = rooms.map((r) => Number(r.baseHourlyRate)).filter((n) => Number.isFinite(n) && n > 0);
  if (rates.length === 0 && city) return comparableRates(category, null);
  return { count: rates.length, medianPerHour: median(rates) };
}

const KNOWN_CITIES = ["London", "Manchester", "Edinburgh", "Birmingham", "Glasgow", "Liverpool", "Leeds", "Bristol"];

/** Deterministic fallback: good enough to open a sensible auction with no LLM. */
export function heuristicDraft(prompt: string, kindHint?: "FORWARD" | "REVERSE") {
  const hoursMatch = prompt.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);
  const daysMatch = prompt.match(/(\d+)\s*days?\b/i);
  const budgetMatch = prompt.match(/(?:£|gbp\s*)(\d+(?:\.\d+)?)(?:\s*(?:\/|per)\s*(h|hr|hour))?/i);
  const selling = /\b(sell|selling|offering|rent out|renting out|list my)\b/i.test(prompt);
  const kind: "FORWARD" | "REVERSE" = kindHint ?? (selling ? "FORWARD" : "REVERSE");
  const city = KNOWN_CITIES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(prompt)) ?? null;
  const category = listingCategoryFor(prompt);
  const hours = roundQuarter(hoursMatch ? Number(hoursMatch[1]) : daysMatch ? Number(daysMatch[1]) * 8 : 3);
  let budgetPerHour: number | null = null;
  if (budgetMatch) {
    const amount = Number(budgetMatch[1]);
    budgetPerHour = budgetMatch[2] ? amount : amount / hours;
  }
  const clean = prompt.replace(/\s+/g, " ").trim();
  const title = (clean.charAt(0).toUpperCase() + clean.slice(1)).slice(0, 120);
  return { kind, city, category, hours, budgetPerHour, title };
}

const draftTool = {
  type: "function" as const,
  function: {
    name: "draft_auction",
    description: "Draft an hourly auction listing from the user's request.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["FORWARD", "REVERSE"], description: "FORWARD if the user is selling hours, REVERSE if buying." },
        title: { type: "string", description: "Short, specific title, 3-100 characters." },
        description: {
          type: "string",
          description: "2-4 sentences: exactly what is included, where, and any requirements. Plain punctuation.",
        },
        category: { type: "string", description: "One or two lowercase words, e.g. 'room', 'car hire', 'airport transfer'." },
        hours: { type: "number", description: "Number of hours, in steps of 0.25." },
        city: { type: "string", description: "UK city if mentioned, else empty." },
        budgetPerHour: { type: "number", description: "Per-hour price the user stated, or 0 if none." },
        durationMinutes: { type: "number", enum: DURATIONS, description: "How long the auction should run before it closes." },
      },
      required: ["kind", "title", "description", "category", "hours", "city", "budgetPerHour", "durationMinutes"],
    },
  },
};

export async function draftAuction(input: AuctionDraftRequest): Promise<AuctionDraft> {
  const h = heuristicDraft(input.prompt, input.kind);
  let kind = h.kind;
  let title = h.title;
  let description = `${h.title}. ${h.city ? `Location: ${h.city}. ` : ""}Please confirm exactly what is included before bidding.`;
  let category = CATEGORY_LABEL[h.category];
  let hours = h.hours;
  let city = h.city;
  let budget = h.budgetPerHour;
  let durationMinutes = 1440;
  let aiPowered = false;

  try {
    const client = getOpenAIClient();
    const res = await client.chat.completions.create(
      {
        model: OPENAI_MODEL,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You help people on Good Hours, a UK marketplace for rooms, cars and travel services by the hour, set up hourly auctions. Turn the request into a clear, honest auction. Never invent facts the user did not give; keep descriptions factual and use plain punctuation (no em dashes).",
          },
          { role: "user", content: input.prompt },
        ],
        tools: [draftTool],
        tool_choice: { type: "function", function: { name: "draft_auction" } },
      },
      { timeout: 8000 }
    );
    const call = res.choices[0]?.message?.tool_calls?.[0];
    if (call && call.type === "function") {
      const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
      if (!input.kind && (args.kind === "FORWARD" || args.kind === "REVERSE")) kind = args.kind;
      if (typeof args.title === "string" && args.title.trim().length >= 3) title = args.title.trim().slice(0, 140);
      if (typeof args.description === "string" && args.description.trim().length >= 10) {
        description = args.description.trim().slice(0, 4000);
      }
      if (typeof args.category === "string" && args.category.trim().length >= 2) {
        category = args.category.trim().toLowerCase().slice(0, 60);
      }
      if (typeof args.hours === "number" && args.hours > 0) hours = roundQuarter(args.hours);
      if (typeof args.city === "string" && args.city.trim()) city = args.city.trim();
      if (typeof args.budgetPerHour === "number" && args.budgetPerHour > 0) budget = args.budgetPerHour;
      if (typeof args.durationMinutes === "number" && DURATIONS.includes(args.durationMinutes)) {
        durationMinutes = args.durationMinutes;
      }
      aiPowered = true;
      recordAiSuccess();
    }
  } catch (error) {
    if (!(error instanceof Error && error.message.includes("not configured"))) recordAiError(error);
  }

  const listingCategory = listingCategoryFor(`${category} ${title}`);
  const comparables = await comparableRates(listingCategory, city);
  const market = comparables.medianPerHour ?? DEFAULT_RATE[listingCategory];
  // Buyer (REVERSE): reserve is the most they'll pay, so default a little above
  // market to attract bids. Seller (FORWARD): reserve is their floor, so a bit below.
  const reservePerHour = roundHalf(budget ?? (kind === "REVERSE" ? market * 1.1 : market * 0.9));

  return {
    kind,
    title: title.replace(/\u2014/g, ", "),
    description: description.replace(/\u2014/g, ", "),
    category,
    hours,
    reservePerHour,
    durationMinutes,
    comparables: {
      count: comparables.count,
      medianPerHour: comparables.medianPerHour === null ? null : Math.round(comparables.medianPerHour * 100) / 100,
    },
    aiPowered,
  };
}

/**
 * Hosts worth inviting to a buyer's auction: real (non-sample) properties in
 * the matching category with at least one active listing priced within budget.
 */
export async function findMatchingHosts(auctionId: string, limit = 25) {
  const auction = await prisma.marketplaceAuction.findUnique({ where: { id: auctionId } });
  if (!auction || auction.kind !== "REVERSE" || auction.status !== "OPEN") return { auction: null, hosts: [] as string[] };
  const category = listingCategoryFor(`${auction.category} ${auction.title}`);
  const properties = await prisma.property.findMany({
    where: {
      category,
      status: { not: "SAMPLE" },
      supplierId: { not: auction.createdById },
      rooms: { some: { status: "ACTIVE", baseHourlyRate: { lte: auction.reservePerHour } } },
    },
    select: { supplierId: true },
    distinct: ["supplierId"],
    take: limit,
  });
  return { auction, hosts: properties.map((p) => p.supplierId) };
}
