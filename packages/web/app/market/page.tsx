"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { MarketplaceKind, MarketplaceSearchResult } from "@gihtcx/shared";
import { PRICING_UNIT_LABELS } from "@gihtcx/shared";
import { api } from "../../lib/apiClient";
import { InteractiveCard } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { SkeletonGrid } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { ListingImage } from "../../components/ui/ListingImage";
import { useCurrentUser } from "../../lib/useCurrentUser";

type KindFilter = "ALL" | MarketplaceKind;

const KIND_TABS: { key: KindFilter; label: string }[] = [
  { key: "ALL", label: "Everything" },
  { key: "PRODUCT", label: "📦 Products" },
  { key: "SERVICE", label: "🧑‍💼 Services" },
];

export default function MarketPage() {
  const { data: user } = useCurrentUser();
  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const [kind, setKind] = useState<KindFilter>("ALL");
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<"newest" | "price_asc" | "price_desc">("newest");

  const { data, isPending, error, refetch } = useQuery<MarketplaceSearchResult>({
    queryKey: ["market-search", submittedQ, kind, category, sort],
    queryFn: () => {
      const params = new URLSearchParams({ sort });
      if (submittedQ) params.set("q", submittedQ);
      if (kind !== "ALL") params.set("kind", kind);
      if (category) params.set("category", category);
      return api.get<MarketplaceSearchResult>(`/market/search?${params.toString()}`);
    },
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Products &amp; services</h1>
          <p className="mt-1 text-sm text-slate-500">
            Buy goods, or hire professional time by the hour, day or project. Pay from your wallet or by card.
          </p>
        </div>
        {user && (
          <div className="flex gap-2">
            <Link
              href="/market/orders"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              My orders
            </Link>
            <Link
              href="/market/new"
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Sell something
            </Link>
          </div>
        )}
      </div>

      {/* Search */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmittedQ(q);
        }}
        className="mb-4 flex flex-wrap gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products and services…"
          className="min-w-[14rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          aria-label="Search products and services"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
          aria-label="Sort results"
        >
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
        <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
          Search
        </button>
      </form>

      {/* Kind tabs */}
      <div className="mb-3 flex flex-wrap gap-2">
        {KIND_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setKind(t.key)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              kind === t.key
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Category chips */}
      {data && data.categories.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setCategory(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              category === null ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All categories
          </button>
          {data.categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c === category ? null : c)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                category === c ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {isPending && <SkeletonGrid count={6} />}
      {error && !isPending && (
        <EmptyState
          icon="⚠️"
          title="We couldn't load the marketplace"
          description="Something went wrong on our side. Please try again in a moment."
          action={
            <button
              onClick={() => refetch()}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Try again
            </button>
          }
        />
      )}

      {data && data.listings.length === 0 && !isPending && (
        <EmptyState
          icon="🛒"
          title="Nothing matches that yet"
          description={
            submittedQ || category || kind !== "ALL"
              ? "Try clearing a filter or searching for something broader."
              : "The marketplace is empty — be the first to list a product or service."
          }
          action={
            user ? (
              <Link
                href="/market/new"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
              >
                Sell something
              </Link>
            ) : undefined
          }
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!isPending &&
          data?.listings.map((l, idx) => (
            <Link key={l.id} href={`/market/${l.id}`}>
              <InteractiveCard
                className="group h-full animate-fade-in-up overflow-hidden"
                style={{ animationDelay: `${Math.min(idx, 8) * 60}ms` }}
              >
                <div className="relative h-36 overflow-hidden">
                  <ListingImage
                    src={l.imageUrl}
                    alt={l.title}
                    seed={l.title}
                    className="transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent" />
                  <span className="absolute bottom-2 left-2 rounded-md bg-black/45 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
                    {l.currency} {l.price.toFixed(2)} {PRICING_UNIT_LABELS[l.pricingUnit]}
                  </span>
                  <span className="absolute right-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-xs font-medium text-slate-700 backdrop-blur">
                    {l.kind === "PRODUCT" ? "📦 Product" : "🧑‍💼 Service"}
                  </span>
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-medium leading-tight">{l.title}</h2>
                    {l.sellerVerified && <Badge tone="success">✓</Badge>}
                  </div>
                  <p className="mt-1 text-xs capitalize text-slate-500">{l.category}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{l.description}</p>
                  {l.stock !== null && (
                    <p className="mt-2 text-xs text-slate-500">
                      {l.stock > 0 ? `${l.stock} available` : "Sold out"}
                    </p>
                  )}
                </div>
              </InteractiveCard>
            </Link>
          ))}
      </div>

      {data && data.total > data.listings.length && (
        <p className="mt-6 text-center text-sm text-slate-500">
          Showing {data.listings.length} of {data.total} — narrow your search to see more.
        </p>
      )}
    </div>
  );
}
