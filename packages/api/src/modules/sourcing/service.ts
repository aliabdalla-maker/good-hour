import { lookup } from "node:dns/promises";
import { prisma } from "@gihtcx/db";
import type {
  FeedItemInput,
  MarketRate,
  PublishDraftInput,
  SourcedDraftOrigin,
  SourcedDraftStatus,
} from "@gihtcx/shared";
import { AppError } from "../../plugins/errorHandler";
import { isPrivateIp } from "../../lib/ip";
import { featureFlags } from "../../config";
import { getApartment, listApartments } from "../../lib/smoobuClient";
import { createProperty, createRoom } from "../listings/service";

const AMENITY_KEYWORDS = [
  "wifi",
  "parking",
  "desk",
  "meeting",
  "spa",
  "breakfast",
  "gym",
  "pool",
  "reception",
  "projector",
  "whiteboard",
  "coffee",
  "kitchen",
  "shower",
];

const MAX_IMPORT_BYTES = 500_000;

/**
 * Rejects non-http(s) URLs and hosts that resolve to private/loopback IPs, to
 * avoid SSRF. (Residual DNS-rebinding risk between this check and the fetch is
 * noted; a production setup would pin the resolved IP on the connection.)
 */
async function assertSafeUrl(u: URL) {
  if (!["http:", "https:"].includes(u.protocol)) {
    throw new AppError(400, "Only http(s) URLs can be imported", "INVALID_URL");
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(u.hostname, { all: true });
  } catch {
    throw new AppError(400, "Could not resolve host", "BLOCKED_URL");
  }
  if (addresses.some((a) => isPrivateIp(a.address))) {
    throw new AppError(400, "Refusing to fetch internal/private addresses", "BLOCKED_URL");
  }
}

interface Extracted {
  title: string;
  rate?: number;
  amenities: string[];
}

function extractFromHtml(html: string): Extracted {
  const pick = (re: RegExp) => (html.match(re)?.[1] ?? "").trim();
  const ogTitle = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const title = ogTitle || pick(/<title[^>]*>([^<]+)<\/title>/i);
  const priceMatch = html.match(/(?:£|\$|€|GBP|USD|EUR)\s?(\d+(?:\.\d{1,2})?)/i);
  const rate = priceMatch ? Number(priceMatch[1]) : undefined;
  const lower = html.toLowerCase();
  const amenities = AMENITY_KEYWORDS.filter((k) => lower.includes(k));
  return { title, rate, amenities };
}

/**
 * Imports a listing from an external URL (the supplier's own page). The page
 * is fetched and heuristically parsed into a DRAFT the supplier reviews before
 * publishing — nothing scraped is ever auto-listed as bookable.
 */
export async function importFromUrl(supplierId: string, url: string) {
  const u = new URL(url);
  await assertSafeUrl(u);

  let extracted: Extracted;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      redirect: "error", // don't follow redirects into internal targets
      headers: { "User-Agent": "GoodHoursBot/1.0 (+listing-import)" },
    });
    const body = (await res.text()).slice(0, MAX_IMPORT_BYTES);
    extracted = extractFromHtml(body);
  } catch {
    // Fetch blocked/failed: still create a skeleton draft to fill in manually.
    extracted = { title: `Imported listing from ${u.hostname}`, amenities: [] };
  }

  return prisma.sourcedListingDraft.create({
    data: {
      supplierId,
      origin: "URL",
      sourceUrl: url,
      status: "DRAFT",
      name: extracted.title || `Listing from ${u.hostname}`,
      amenities: extracted.amenities,
      suggestedHourlyRate: extracted.rate,
      currency: "GBP",
      rawExtract: extracted as object,
    },
  });
}

/** Bulk import from a partner feed/CSV (already parsed into items). */
export async function importFromFeed(supplierId: string, items: FeedItemInput[]) {
  const drafts = await prisma.$transaction(
    items.map((item) =>
      prisma.sourcedListingDraft.create({
        data: {
          supplierId,
          origin: "FEED",
          status: "DRAFT",
          name: item.name,
          addressLine: item.addressLine,
          city: item.city,
          country: item.country,
          amenities: item.amenities,
          suggestedHourlyRate: item.hourlyRate,
          currency: item.currency,
          rawExtract: item as object,
        },
      })
    )
  );
  return drafts;
}

/**
 * Pulls every property from the platform's connected Smoobu account in as a
 * review-before-publish draft, same as a URL/feed import -- nothing from
 * Smoobu is ever auto-listed as bookable. Skips apartments already imported
 * by this supplier (matched on the synthetic "smoobu://apartment/<id>"
 * sourceUrl), so re-running this is safe and only pulls in what's new.
 */
export async function importFromSmoobu(supplierId: string) {
  if (!featureFlags.smoobuEnabled) {
    throw new AppError(503, "Smoobu is not configured", "SMOOBU_UNAVAILABLE");
  }

  const apartments = await listApartments();
  const existing = await prisma.sourcedListingDraft.findMany({
    where: { supplierId, origin: "SMOOBU" },
    select: { sourceUrl: true },
  });
  const alreadyImported = new Set(existing.map((d) => d.sourceUrl));

  const drafts = [];
  for (const summary of apartments) {
    const sourceUrl = `smoobu://apartment/${summary.id}`;
    if (alreadyImported.has(sourceUrl)) continue;

    const apartment = await getApartment(summary.id);
    const minimalRate = Number(apartment.price?.minimal ?? 0);
    // Smoobu's price is a per-stay/nightly rate, not hourly -- offer a rough
    // starting point only when there's a real rate to convert; otherwise
    // leave it for the supplier to set during review rather than guessing.
    const suggestedHourlyRate = minimalRate > 0 ? Math.round((minimalRate / 24) * 100) / 100 : undefined;

    const draft = await prisma.sourcedListingDraft.create({
      data: {
        supplierId,
        origin: "SMOOBU",
        sourceUrl,
        status: "DRAFT",
        name: apartment.name || `Smoobu apartment ${apartment.id}`,
        addressLine: apartment.location?.street ?? undefined,
        city: apartment.location?.city ?? undefined,
        country: apartment.location?.country ?? undefined,
        amenities: apartment.amenities ?? [],
        suggestedHourlyRate,
        currency: apartment.currency || "GBP",
        rawExtract: apartment as object,
      },
    });
    drafts.push(draft);
  }

  return drafts;
}

export async function listDrafts(supplierId: string) {
  return prisma.sourcedListingDraft.findMany({
    where: { supplierId, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Publishes a reviewed draft as a real, bookable property + room. The supplier
 * is accountable for the accuracy of what they publish.
 */
export async function publishDraft(supplierId: string, draftId: string, input: PublishDraftInput) {
  const draft = await prisma.sourcedListingDraft.findUnique({ where: { id: draftId } });
  if (!draft || draft.supplierId !== supplierId) {
    throw new AppError(404, "Draft not found", "NOT_FOUND");
  }
  if (draft.status !== "DRAFT") {
    throw new AppError(409, "Draft has already been published or discarded", "INVALID_STATE");
  }

  const property = await createProperty(supplierId, {
    name: input.name,
    // Sourcing currently imports accommodation listings only.
    category: "ROOM",
    addressLine: input.addressLine,
    city: input.city,
    country: input.country,
    lat: 0,
    lng: 0,
    amenities: input.amenities,
  });

  await createRoom(supplierId, {
    propertyId: property.id,
    name: input.roomName,
    capacity: input.capacity,
    amenities: input.amenities,
    // Imported/sourced listings are never AI-generated photos.
    imageIsAiGenerated: false,
    baseHourlyRate: input.baseHourlyRate,
    currency: input.currency,
    minHours: input.minHours,
    maxHours: input.maxHours,
    autoOfferEnabled: false,
  });

  await prisma.sourcedListingDraft.update({
    where: { id: draftId },
    data: { status: "PUBLISHED", publishedPropertyId: property.id },
  });

  return property;
}

export async function discardDraft(supplierId: string, draftId: string) {
  await prisma.sourcedListingDraft.updateMany({
    where: { id: draftId, supplierId },
    data: { status: "DISCARDED" },
  });
}

/**
 * Competitor price research for a city. In production this scrapes public
 * listing sites; here it falls back to an internal benchmark computed from our
 * own catalogue, clearly labelled as such so the pricing agent knows the
 * provenance.
 */
export async function getMarketRate(city: string): Promise<MarketRate> {
  const rooms = await prisma.room.findMany({
    where: { status: "ACTIVE", property: { city: { contains: city, mode: "insensitive" } } },
    select: { baseHourlyRate: true },
  });
  if (rooms.length === 0) {
    return { city, samples: 0, averageHourlyRate: null, source: "internal" };
  }
  const avg = rooms.reduce((sum, r) => sum + Number(r.baseHourlyRate), 0) / rooms.length;
  return { city, samples: rooms.length, averageHourlyRate: Math.round(avg * 100) / 100, source: "internal" };
}

export function toPublicDraft(d: {
  id: string;
  origin: SourcedDraftOrigin;
  sourceUrl: string | null;
  status: SourcedDraftStatus;
  name: string;
  addressLine: string | null;
  city: string | null;
  country: string | null;
  amenities: string[];
  suggestedHourlyRate: unknown;
  currency: string;
  publishedPropertyId: string | null;
  createdAt: Date;
}) {
  return {
    id: d.id,
    origin: d.origin,
    sourceUrl: d.sourceUrl,
    status: d.status,
    name: d.name,
    addressLine: d.addressLine,
    city: d.city,
    country: d.country,
    amenities: d.amenities,
    suggestedHourlyRate: d.suggestedHourlyRate === null ? null : Number(d.suggestedHourlyRate),
    currency: d.currency,
    publishedPropertyId: d.publishedPropertyId,
    createdAt: d.createdAt.toISOString(),
  };
}
