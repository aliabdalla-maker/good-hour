"use client";

import {
  DOMAINS,
  TRADING_MODEL_HINTS,
  TRADING_MODEL_LABELS,
  computeFacets,
  domainsByCluster,
  tradingModelsFor,
  type FacetCounts,
  type TradingModel,
} from "@gihtcx/shared";
import { cn } from "../../lib/cn";

/**
 * Trading-model badges and the faceted filter, ported from the ACE prototype.
 *
 * The idea worth taking: Good Hours already implements five different ways to
 * transact and showed none of them on a listing. Somebody browsing had no way to know
 * a card could be auctioned, negotiated by an agent, or paid for in hours — the
 * mechanics existed and were invisible, which is the same as not having them.
 *
 * What was NOT taken: eight fabricated "Verified Live Listing" entries with invented
 * star ratings, and a "watch an ad, earn 0.5 credits" mechanic that mints transferable
 * stored value from ad views. The first would make the liquidity requirement read green
 * while remaining false; the second walks into the unanswered e-money question.
 */

const MODEL_STYLE: Record<TradingModel, string> = {
  HOURLY_BOOKING: "bg-brand-50 text-brand-800 border-brand-200",
  FIXED_PRICE: "bg-slate-100 text-slate-700 border-slate-200",
  FORWARD_AUCTION: "bg-warning-50 text-warning-800 border-warning-200",
  REVERSE_AUCTION: "bg-info-50 text-info-800 border-info-200",
  TIME_CREDIT: "bg-success-50 text-success-800 border-success-200",
  AGENT_NEGOTIATION: "bg-ai-50 text-ai-800 border-ai-200",
};

export function TradingModelBadges({
  models,
  className,
}: {
  models: TradingModel[];
  className?: string;
}) {
  if (models.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1", className)}>
      {models.map((m) => (
        <li key={m}>
          {/* title, so the badge explains itself on hover rather than being jargon. */}
          <span
            title={TRADING_MODEL_HINTS[m]}
            className={cn("inline-block rounded-md border px-1.5 py-0.5 text-xs font-medium", MODEL_STYLE[m])}
          >
            {TRADING_MODEL_LABELS[m]}
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface MarketFacetInput {
  kind: "PRODUCT" | "SERVICE";
  category: string;
  domain: string | null;
  hasOpenAuction: boolean;
}

/** Derives the badge set for one marketplace listing. */
export function modelsForListing(l: MarketFacetInput): TradingModel[] {
  return tradingModelsFor({
    kind: "MARKETPLACE_LISTING",
    hasOpenAuction: l.hasOpenAuction,
  });
}

export function facetsForListings(listings: MarketFacetInput[], matching?: number): FacetCounts {
  return computeFacets(
    listings.map((l) => ({ domain: l.domain, models: modelsForListing(l) })),
    matching
  );
}

export interface FacetFilterState {
  domains: string[];
  models: TradingModel[];
}

/**
 * The filter panel.
 *
 * Counts come from the whole catalogue rather than the filtered subset, so a chip
 * reading "0" tells you there is nothing there instead of leaving you to click and
 * find out. Empty domains are shown, dimmed and disabled — hiding them would be
 * tidier and would also hide what the platform is *for*, which on a marketplace with
 * almost no inventory is the more useful information.
 */
export function FacetFilter({
  facets,
  value,
  onChange,
}: {
  facets: FacetCounts;
  value: FacetFilterState;
  onChange: (next: FacetFilterState) => void;
}) {
  const toggle = <T extends string>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const active = value.domains.length + value.models.length;

  return (
    <aside className="flex flex-col gap-5" aria-label="Filter listings">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-slate-900">Categories</h2>
          <p className="text-xs text-slate-500" aria-live="polite">
            <span className="font-semibold text-slate-900">{facets.matching}</span> / {facets.total}
          </p>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          Counts are of the whole catalogue, so a zero means nothing is listed there yet.
        </p>

        <div className="mt-3 flex flex-col gap-3">
          {domainsByCluster().map((group) => {
            const clusterCount =
              facets.clusters.find((c) => c.id === group.cluster)?.count ?? 0;
            return (
              <div key={group.cluster}>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {group.label}{" "}
                  <span className="text-slate-400">({clusterCount})</span>
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {group.domains.map((d) => {
                    const count = facets.domains.find((f) => f.id === d.id)?.count ?? 0;
                    const selected = value.domains.includes(d.id);
                    const empty = count === 0;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        aria-pressed={selected}
                        disabled={empty && !selected}
                        onClick={() => onChange({ ...value, domains: toggle(value.domains, d.id) })}
                        className={cn(
                          "inline-flex min-h-6 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition",
                          selected
                            ? "border-brand-500 bg-brand-50 text-brand-800"
                            : empty
                              ? "cursor-not-allowed border-slate-200 text-slate-400"
                              : "border-slate-200 text-slate-600 hover:border-slate-300"
                        )}
                      >
                        {d.label}
                        <span className={selected ? "text-brand-600" : "text-slate-400"}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="font-display text-sm font-semibold text-slate-900">How it trades</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          The same listing can often be bought more than one way.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {facets.models
            .filter((m) => m.count > 0 || value.models.includes(m.id as TradingModel))
            .map((m) => {
              const model = m.id as TradingModel;
              const selected = value.models.includes(model);
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={selected}
                  title={TRADING_MODEL_HINTS[model]}
                  onClick={() => onChange({ ...value, models: toggle(value.models, model) })}
                  className={cn(
                    "inline-flex min-h-6 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition",
                    selected
                      ? "border-brand-500 bg-brand-50 text-brand-800"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  )}
                >
                  {m.label}
                  <span className={selected ? "text-brand-600" : "text-slate-400"}>{m.count}</span>
                </button>
              );
            })}
          {facets.models.every((m) => m.count === 0) && (
            <p className="text-xs text-slate-500">Nothing listed yet.</p>
          )}
        </div>
      </div>

      {active > 0 && (
        <button
          type="button"
          onClick={() => onChange({ domains: [], models: [] })}
          className="self-start text-xs font-medium text-brand-700 underline"
        >
          Clear {active} filter{active === 1 ? "" : "s"}
        </button>
      )}
    </aside>
  );
}

/** Applies a filter state to a list. Kept next to the UI so the two cannot diverge. */
export function applyFacetFilter<T extends MarketFacetInput>(
  listings: T[],
  filter: FacetFilterState
): T[] {
  return listings.filter((l) => {
    if (filter.domains.length > 0 && (!l.domain || !filter.domains.includes(l.domain))) {
      return false;
    }
    if (filter.models.length > 0) {
      const models = modelsForListing(l);
      // ANY, not ALL: a buyer picking "forward auction" and "time credits" wants
      // either, not the rare listing that happens to support both.
      if (!filter.models.some((m) => models.includes(m))) return false;
    }
    return true;
  });
}

export const DOMAIN_LABELS: Record<string, string> = Object.fromEntries(
  DOMAINS.map((d) => [d.id, d.label])
);
