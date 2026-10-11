"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { AuctionPublic } from "@gihtcx/shared";
import { AUCTION_KIND_LABELS } from "@gihtcx/shared";
import { api } from "../../../lib/apiClient";
import { RequireAuth } from "../../../components/RequireAuth";
import { Spinner } from "../../../components/ui/Spinner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Badge } from "../../../components/ui/Badge";
import { timeLeft } from "../../../lib/timeLeft";

export default function MyAuctionsPage() {
  return (
    <RequireAuth>
      <MyAuctionsInner />
    </RequireAuth>
  );
}

function MyAuctionsInner() {
  const { data, isPending, error, refetch } = useQuery<{ created: AuctionPublic[]; bidding: AuctionPublic[] }>({
    queryKey: ["my-auctions"],
    queryFn: () => api.get<{ created: AuctionPublic[]; bidding: AuctionPublic[] }>("/auctions/mine"),
    refetchInterval: 15_000,
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Spinner /> <span className="ms-2 text-sm">Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon="⚠️"
        title="Couldn't load your auctions"
        description={error instanceof Error ? error.message : "Please try again in a moment."}
        action={
          <button onClick={() => refetch()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">
            Try again
          </button>
        }
      />
    );
  }

  const nothing = !data || (data.created.length === 0 && data.bidding.length === 0);

  return (
    <div>
      <Link href="/auctions" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">
        ← Hourly auctions
      </Link>
      <h1 className="font-display mb-6 text-2xl font-semibold">My auctions</h1>

      {nothing && (
        <EmptyState
          icon="⏱️"
          title="Nothing yet"
          description="Auctions you open, and ones you've bid on, appear here. Describe what you need in one sentence and the AI drafts and prices the auction for you."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/auctions/new" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">
                ✦ Start an auction with AI
              </Link>
              <Link href="/auctions" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Browse open auctions
              </Link>
            </div>
          }
        />
      )}

      <Section title="Opened by me" rows={data?.created ?? []} />
      <Section title="I'm bidding on" rows={data?.bidding ?? []} />
    </div>
  );
}

const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral" | "brand"> = {
  OPEN: "brand",
  CLOSED: "warning",
  SETTLED: "success",
  UNMET: "neutral",
  CANCELLED: "danger",
};

function Section({ title, rows }: { title: string; rows: AuctionPublic[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-8 animate-fade-in-up">
      <h2 className="font-display mb-3 text-lg font-semibold">
        {title} ({rows.length})
      </h2>
      <div className="overflow-x-auto">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Auction</th>
                <th className="px-3 py-2">Direction</th>
                <th className="px-3 py-2 text-end">Leading</th>
                <th className="px-3 py-2">Closes</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <Link href={`/auctions/${a.id}`} className="font-medium hover:underline">
                      {a.title}
                    </Link>
                    <span className="block text-xs text-slate-500">{a.hours}h · {a.category}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{AUCTION_KIND_LABELS[a.kind]}</td>
                  <td className="px-3 py-2 text-end font-medium">
                    {a.leadingPerHour === null ? "-" : `${a.currency} ${a.leadingPerHour.toFixed(2)}/hr`}
                    {a.viewerIsLeading && <span className="ms-1 text-xs text-success-700">✓</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{timeLeft(a.closesAt)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={STATUS_TONE[a.status] ?? "neutral"}>
                      {a.status.toLowerCase()}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
