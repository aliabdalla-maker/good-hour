import type { ListingCategory } from "./enums";

/**
 * Clusters, domains and trading models — the taxonomy ACE surfaces and Good Hours
 * had only implicitly.
 *
 * ACE's best idea is not a feature, it is an admission: a listing can be traded in
 * several different ways, and a buyer cannot tell which without being told. Good Hours
 * already implements all five mechanics — hourly booking, forward auction, reverse
 * auction, time-credit redemption and agent negotiation — and surfaced none of them on
 * a listing. A capability nobody can see is a capability nobody uses.
 *
 * ## Derived, not stored
 *
 * Trading models are computed from what a listing actually is, never written to a
 * column. A stored flag drifts the moment the mechanics change — a listing would
 * advertise "forward auction" after its auction closed, and the badge would be a lie
 * with a database row backing it up. Derivation cannot go stale.
 */

export const TRADING_MODELS = [
  "HOURLY_BOOKING",
  "FIXED_PRICE",
  "FORWARD_AUCTION",
  "REVERSE_AUCTION",
  "TIME_CREDIT",
  "AGENT_NEGOTIATION",
] as const;
export type TradingModel = (typeof TRADING_MODELS)[number];

export const TRADING_MODEL_LABELS: Record<TradingModel, string> = {
  HOURLY_BOOKING: "Hourly booking",
  FIXED_PRICE: "Fixed price",
  FORWARD_AUCTION: "Forward auction",
  REVERSE_AUCTION: "Reverse auction",
  TIME_CREDIT: "Time credits",
  AGENT_NEGOTIATION: "Agent negotiation",
};

/** One-line explanations, because a badge nobody understands is decoration. */
export const TRADING_MODEL_HINTS: Record<TradingModel, string> = {
  HOURLY_BOOKING: "Book a block of hours at the listed rate.",
  FIXED_PRICE: "Buy now at the listed price.",
  FORWARD_AUCTION: "Bidders compete upward; the highest bid at close wins.",
  REVERSE_AUCTION: "Post what you need and sellers bid the price down.",
  TIME_CREDIT: "Pay with hours from your wallet instead of cash.",
  AGENT_NEGOTIATION: "Set a ceiling and let an agent bid for you.",
};

export interface TradingModelInput {
  /** A bookable unit (room, vehicle, service slot) rather than a catalogue item. */
  kind: "BOOKABLE_UNIT" | "MARKETPLACE_LISTING";
  /** Whether an OPEN auction currently references this listing. */
  hasOpenAuction?: boolean;
  /** Whether there is time-credit liquidity in this category to redeem against. */
  timeCreditEligible?: boolean;
}

/**
 * Which ways this listing can actually be traded, right now.
 *
 * Order is stable and meaningful: the primary way to transact comes first, so a card
 * reads left to right from "what most people will do" to "what is also possible".
 */
export function tradingModelsFor(input: TradingModelInput): TradingModel[] {
  const models: TradingModel[] = [];

  if (input.kind === "BOOKABLE_UNIT") {
    models.push("HOURLY_BOOKING");
    // Reverse auction applies to bookable units only: a buyer states a need and
    // suppliers bid the price down. There is nothing to bid down on a catalogue item.
    models.push("REVERSE_AUCTION");
  } else {
    models.push("FIXED_PRICE");
  }

  if (input.hasOpenAuction) models.push("FORWARD_AUCTION");
  if (input.timeCreditEligible) models.push("TIME_CREDIT");

  // Agent negotiation is only meaningful where there is a live contest to act in.
  // Advertising it on a fixed-price item with no auction promises a mechanic that has
  // nothing to negotiate against.
  if (input.hasOpenAuction) models.push("AGENT_NEGOTIATION");

  return models;
}

// --- Clusters and domains ----------------------------------------------------

export const CLUSTERS = ["HOSPITALITY", "TRANSPORT", "PROFESSIONAL", "TECHNOLOGY", "SPACE"] as const;
export type Cluster = (typeof CLUSTERS)[number];

export const CLUSTER_LABELS: Record<Cluster, string> = {
  HOSPITALITY: "Hospitality",
  TRANSPORT: "Transport & travel",
  PROFESSIONAL: "Professional services",
  TECHNOLOGY: "Technology",
  SPACE: "Space & equipment",
};

export interface DomainDefinition {
  id: string;
  label: string;
  cluster: Cluster;
  /**
   * The existing `ListingCategory` this domain maps onto, when it maps onto one.
   *
   * This is the honest seam. The database has three categories (ROOM/CAR/TRAVEL); ACE
   * showed eight domains. Domains are a *presentation* layer over those categories
   * plus the free-text `category` on marketplace listings. Adding eight enum values
   * would have meant a migration, and three of them would have had no inventory path
   * behind them — an empty category that looks like a promise.
   */
  category: ListingCategory | null;
}

export const DOMAINS: DomainDefinition[] = [
  { id: "hospitality", label: "Hospitality & hotels", cluster: "HOSPITALITY", category: "ROOM" },
  { id: "workspace", label: "Workspace & venues", cluster: "SPACE", category: "ROOM" },
  { id: "chauffeur", label: "Chauffeur & transport", cluster: "TRANSPORT", category: "CAR" },
  { id: "travel", label: "Tours & experiences", cluster: "TRANSPORT", category: "TRAVEL_SERVICE" },
  { id: "aviation", label: "Flights & aviation", cluster: "TRANSPORT", category: null },
  { id: "tech", label: "AI & tech services", cluster: "TECHNOLOGY", category: null },
  { id: "compute", label: "Compute & equipment", cluster: "TECHNOLOGY", category: null },
  { id: "legal", label: "Legal & financial", cluster: "PROFESSIONAL", category: null },
];

export const DOMAIN_IDS = DOMAINS.map((d) => d.id);

/** Domains grouped by cluster, in the display order of CLUSTERS. */
export function domainsByCluster(): {
  cluster: Cluster;
  label: string;
  domains: DomainDefinition[];
}[] {
  return CLUSTERS.map((cluster) => ({
    cluster,
    label: CLUSTER_LABELS[cluster],
    domains: DOMAINS.filter((d) => d.cluster === cluster),
  })).filter((group) => group.domains.length > 0);
}

export interface FacetCount {
  id: string;
  label: string;
  count: number;
}

export interface FacetCounts {
  clusters: FacetCount[];
  domains: FacetCount[];
  models: FacetCount[];
  total: number;
  /** How many match the current filter — ACE's "8 / 8" readout. */
  matching: number;
}

export interface FacetableListing {
  domain: string | null;
  models: TradingModel[];
}

/**
 * Counts facets over a result set.
 *
 * Counts are computed over the WHOLE set, not the filtered subset, because a facet
 * reading "0" is information: it says "nothing here", which is what stops someone
 * clicking hopefully through empty categories. Counting only the filtered subset
 * shows a number beside the facet already selected and zero everywhere else, which
 * reads as an empty catalogue rather than a narrowed one.
 */
export function computeFacets(
  listings: FacetableListing[],
  matching = listings.length
): FacetCounts {
  const domainCount = new Map<string, number>();
  const clusterCount = new Map<string, number>();
  const modelCount = new Map<string, number>();

  for (const listing of listings) {
    if (listing.domain) {
      domainCount.set(listing.domain, (domainCount.get(listing.domain) ?? 0) + 1);
      const def = DOMAINS.find((d) => d.id === listing.domain);
      if (def) clusterCount.set(def.cluster, (clusterCount.get(def.cluster) ?? 0) + 1);
    }
    for (const model of listing.models) {
      modelCount.set(model, (modelCount.get(model) ?? 0) + 1);
    }
  }

  return {
    clusters: CLUSTERS.map((c) => ({
      id: c,
      label: CLUSTER_LABELS[c],
      count: clusterCount.get(c) ?? 0,
    })),
    domains: DOMAINS.map((d) => ({ id: d.id, label: d.label, count: domainCount.get(d.id) ?? 0 })),
    models: TRADING_MODELS.map((m) => ({
      id: m,
      label: TRADING_MODEL_LABELS[m],
      count: modelCount.get(m) ?? 0,
    })),
    total: listings.length,
    matching,
  };
}

/**
 * Best-effort domain for a marketplace listing's free-text category.
 *
 * Returns null rather than guessing when nothing matches. A listing appearing under
 * no domain is better than one filed under the wrong domain, where the person who
 * listed it will never find it and will conclude the site lost it.
 */
export function inferDomain(category: string | null | undefined): string | null {
  if (!category) return null;
  const c = category.trim().toLowerCase();
  const rules: [RegExp, string][] = [
    [/hotel|suite|room|stay|hospitality/, "hospitality"],
    [/desk|office|cowork|venue|studio|space/, "workspace"],
    [/chauffeur|driver|transport|\bvan\b|taxi|\bcar\b/, "chauffeur"],
    [/tour|experience|guide|travel/, "travel"],
    [/flight|\bjet\b|aviation|charter/, "aviation"],
    [/\bai\b|software|\bdev\b|engineer|data|tech/, "tech"],
    [/\bgpu\b|compute|cluster|machinery|equipment/, "compute"],
    [/legal|lawyer|counsel|account|financ|\btax\b/, "legal"],
  ];
  for (const [pattern, domain] of rules) {
    if (pattern.test(c)) return domain;
  }
  return null;
}
