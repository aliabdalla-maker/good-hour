"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { AuctionKind, AuctionPublic } from "@gihtcx/shared";
import { AUCTION_KIND_LABELS } from "@gihtcx/shared";
import { api } from "../../lib/apiClient";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { timeLeft } from "../../lib/timeLeft";
import { InteractiveCard } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { SkeletonGrid } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";

type KindFilter = "ALL" | AuctionKind;

const TABS: { key: KindFilter; label: string; hint: string }[] = [
  { key: "ALL", label: "All auctions", hint: "" },
  { key: "FORWARD", label: "⬆ Buyers bid up", hint: "A seller offers hours; the highest bid wins." },
  { key: "REVERSE", label: "⬇ Sellers bid down", hint: "A buyer needs hours; the lowest bid wins." },
];

export default function AuctionsPage() {
  const { data: user } = useCurrentUser();
  const [kind, setKind] = useState<KindFilter>("ALL");

  const { data, isPending, error, refetch } = useQuery<AuctionPublic[]>({
    queryKey: ["auctions", kind],
    queryFn: () => {
      const p = new URLSearchParams();
      if (kind !== "ALL") p.set("kind", kind);
      return api.get<AuctionPublic[]>(`/auctions?${p.toString()}`);
    },
    // Live prices go stale fast while an auction is running.
    refetchInterval: 10_000,
  });

  const activeTab = TABS.find((t) => t.key === kind);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Hourly auctions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Bid on products and services by the hour. Set a ceiling and your AI agent bids for you.
          </p>
        </div>
        {user && (
          <div className="flex gap-2">
            <Link
              href="/auctions/mine"
              className="inline-flex min-h-6 items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              My auctions
            </Link>
            <Link
              href="/auctions/new"
              className="inline-flex min-h-6 items-center rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
            >
              Start an auction
            </Link>
          </div>
        )}
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        {TABS.map((t) => (
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
      {activeTab?.hint && <p className="mb-6 text-xs text-slate-500">{activeTab.hint}</p>}

      {isPending && <SkeletonGrid count={4} />}
      {error && !isPending && (
        <EmptyState
          icon="⚠️"
          title="We couldn't load the auctions"
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

      {data && data.length === 0 && !isPending && (
        <EmptyState
          icon="⏱️"
          title="No open auctions"
          description="Start one and let buyers or sellers bid on your hours."
          action={
            user ? (
              <Link
                href="/auctions/new"
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
              >
                Start an auction
              </Link>
            ) : undefined
          }
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!isPending &&
          data?.map((a, i) => (
            <Link key={a.id} href={`/auctions/${a.id}`}>
              <InteractiveCard
                className="h-full animate-fade-in-up p-4"
                style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <Badge tone="neutral">
                    {a.kind === "FORWARD" ? "⬆" : "⬇"} {AUCTION_KIND_LABELS[a.kind]}
                  </Badge>
                  <span className="shrink-0 text-xs font-medium text-slate-600">{timeLeft(a.closesAt)}</span>
                </div>
                <h2 className="font-medium leading-tight">{a.title}</h2>
                <p className="mt-1 text-xs capitalize text-slate-500">
                  {a.category} · {a.hours}h
                </p>
                <div className="mt-3">
                  <p className="text-lg font-semibold">
                    {a.currency} {(a.leadingPerHour ?? a.reservePerHour).toFixed(2)}
                    <span className="text-sm font-normal text-slate-500">/hr</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {a.leadingPerHour === null
                      ? `${a.kind === "FORWARD" ? "Opening" : "Budget"} price · no bids yet`
                      : `${a.bidCount} bid${a.bidCount === 1 ? "" : "s"} · total ${a.currency} ${(a.leadingTotal ?? 0).toFixed(2)}`}
                  </p>
                </div>
                {a.viewerIsLeading && (
                  <p className="mt-2 text-xs font-medium text-success-700">✓ You&apos;re leading</p>
                )}
              </InteractiveCard>
            </Link>
          ))}
      </div>
    </div>
  );
}
