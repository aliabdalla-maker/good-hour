"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuctionDetail, MoneyWallet } from "@gihtcx/shared";
import { AUCTION_KIND_LABELS, MIN_BID_INCREMENT } from "@gihtcx/shared";
import { api, ApiError } from "../../../lib/apiClient";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { Spinner } from "../../../components/ui/Spinner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { AiBadge } from "../../../components/ai/AiBadge";
import { timeLeft } from "../../../lib/timeLeft";

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: user } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();

  const [amount, setAmount] = useState<number | null>(null);
  const [useAgent, setUseAgent] = useState(false);
  const [ceiling, setCeiling] = useState<number | null>(null);
  const [autoSettle, setAutoSettle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isPending, error: loadError, refetch } = useQuery<AuctionDetail>({
    queryKey: ["auction", id],
    queryFn: () => api.get<AuctionDetail>(`/auctions/${id}`),
    // Someone else's agent can outbid you between renders.
    refetchInterval: (q) => (q.state.data?.auction.status === "OPEN" ? 5000 : false),
  });

  const { data: wallet } = useQuery<MoneyWallet>({
    queryKey: ["money-wallet"],
    queryFn: () => api.get<MoneyWallet>("/wallet"),
    retry: false,
    enabled: Boolean(user),
  });

  const a = data?.auction;

  // Track the live minimum rather than freezing whatever it was on first paint.
  useEffect(() => {
    if (a && amount === null) setAmount(a.nextValidPerHour);
  }, [a, amount]);

  const bid = useMutation({
    mutationFn: () =>
      api.post<AuctionDetail>(`/auctions/${id}/bids`, {
        amountPerHour: amount,
        maxPerHour: useAgent && ceiling ? ceiling : undefined,
        autoSettle: useAgent ? autoSettle : false,
      }),
    onMutate: () => setError(null),
    onSuccess: (d) => {
      qc.setQueryData(["auction", id], d);
      setAmount(d.auction.nextValidPerHour);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 401) {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setError(e instanceof ApiError ? e.message : "Couldn't place that bid");
    },
  });

  const settle = useMutation({
    mutationFn: () => api.post<AuctionDetail>(`/auctions/${id}/settle`),
    onMutate: () => setError(null),
    onSuccess: (d) => {
      qc.setQueryData(["auction", id], d);
      qc.invalidateQueries({ queryKey: ["money-wallet"] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't settle"),
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Spinner /> <span className="ms-2 text-sm">Loading…</span>
      </div>
    );
  }
  if (loadError && !(loadError instanceof ApiError && loadError.status === 404)) {
    return (
      <EmptyState
        icon="⚠️"
        title="Couldn't load this auction"
        description={loadError instanceof Error ? loadError.message : "Please try again in a moment."}
        action={
          <button onClick={() => refetch()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">
            Try again
          </button>
        }
      />
    );
  }
  if (!data || !a) {
    return (
      <EmptyState
        icon="🔍"
        title="Auction not found"
        description="It may have been removed."
        action={
          <Link href="/auctions" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">
            All auctions
          </Link>
        }
      />
    );
  }

  const isOpen = a.status === "OPEN" && new Date(a.closesAt) > new Date();
  const isMine = user?.id === a.createdById;
  const winningBid = data.bids.find((b) => b.id === a.winningBidId);
  const viewerWon = Boolean(winningBid && winningBid.bidderId === user?.id);
  // In a FORWARD auction the winning bidder pays. In a REVERSE auction the
  // auction's creator is the buyer, so they settle.
  const viewerMustSettle =
    a.status === "CLOSED" && (a.kind === "FORWARD" ? viewerWon : isMine);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <Link href="/auctions" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">
          ← Hourly auctions
        </Link>
        <Card className="animate-fade-in-up p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <Badge tone="neutral">
              {a.kind === "FORWARD" ? "⬆" : "⬇"} {AUCTION_KIND_LABELS[a.kind]}
            </Badge>
            <span className="text-sm font-medium text-slate-700">{timeLeft(a.closesAt)}</span>
          </div>
          <h1 className="font-display text-2xl font-semibold">{a.title}</h1>
          <p className="mt-1 text-sm capitalize text-slate-500">
            {a.category} · {a.hours} hours · opened by {a.createdByHandle}
          </p>
          <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{a.description}</p>
          <p className="mt-4 text-xs text-slate-500">
            {a.kind === "FORWARD"
              ? `Reserve: ${a.currency} ${a.reservePerHour.toFixed(2)}/hr. Bids below this can't win.`
              : `Budget ceiling: ${a.currency} ${a.reservePerHour.toFixed(2)}/hr. Bids above this can't win.`}
          </p>
        </Card>

        <section className="mt-6">
          <h2 className="font-display mb-3 text-lg font-semibold">Bid history</h2>
          {data.bids.length === 0 ? (
            <p className="text-sm text-slate-500">No bids yet.</p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Bidder</th>
                    <th className="px-3 py-2 text-end">Per hour</th>
                    <th className="px-3 py-2 text-end">Total</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bids.map((b) => (
                    <tr key={b.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                      <td className="px-3 py-2">
                        {b.bidderId === user?.id ? "You" : b.bidderHandle}
                        {b.isAgentPlaced && <AiBadge label="agent" className="ms-2" />}
                      </td>
                      <td className="px-3 py-2 text-end font-medium">
                        {a.currency} {b.amountPerHour.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-end text-slate-600">
                        {a.currency} {b.totalAmount.toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          tone={b.status === "WON" ? "success" : b.status === "ACTIVE" ? "neutral" : "neutral"}
                        >
                          {b.status.toLowerCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <Card className="animate-fade-in-up self-start p-5" style={{ animationDelay: "60ms" }}>
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {a.leadingPerHour === null ? "Opening price" : "Leading bid"}
        </p>
        <p className="text-3xl font-semibold">
          {a.currency} {(a.leadingPerHour ?? a.reservePerHour).toFixed(2)}
          <span className="text-base font-normal text-slate-500">/hr</span>
        </p>
        {a.leadingTotal !== null && (
          <p className="mt-1 text-sm text-slate-600">
            Total for {a.hours}h: {a.currency} {a.leadingTotal.toFixed(2)}
          </p>
        )}
        {a.viewerIsLeading && <p className="mt-2 text-sm font-medium text-success-700">✓ You&apos;re leading</p>}

        {data.feePreview && (
          <div className="mt-4 space-y-1 rounded-xl bg-slate-50 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Winning total</span>
              <span>
                {a.currency} {data.feePreview.subtotal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Buyer pays</span>
              <span className="font-medium">
                {a.currency} {data.feePreview.buyerTotal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Seller receives</span>
              <span className="font-medium">
                {a.currency} {data.feePreview.sellerProceeds.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {isMine && <p className="mt-4 text-xs text-warning-700">This is your auction, so you can&apos;t bid on it.</p>}

        {isOpen && !isMine && (
          <div className="mt-4">
            <label className="block text-sm">
              Your bid ({a.currency} per hour)
              <input
                type="number"
                step={MIN_BID_INCREMENT}
                value={amount ?? ""}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
              <span className="mt-1 block text-xs text-slate-500">
                {a.kind === "FORWARD"
                  ? `Must be at least ${a.currency} ${a.nextValidPerHour.toFixed(2)}`
                  : `Must be at most ${a.currency} ${a.nextValidPerHour.toFixed(2)}`}
              </span>
            </label>

            <div className="mt-3 rounded-xl border border-ai-200 bg-ai-50/60 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-ai-800">
                <input type="checkbox" checked={useAgent} onChange={(e) => setUseAgent(e.target.checked)} />
                <AiBadge label="Let my agent bid for me" />
              </label>
              {useAgent && (
                <div className="mt-2 space-y-2">
                  <label className="block text-xs text-slate-700">
                    {a.kind === "FORWARD" ? "Never pay more than" : "Never go below"} ({a.currency}/hr)
                    <input
                      type="number"
                      step={MIN_BID_INCREMENT}
                      value={ceiling ?? ""}
                      onChange={(e) => setCeiling(Number(e.target.value))}
                      placeholder={a.kind === "FORWARD" ? "e.g. 95" : "e.g. 40"}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
                    />
                  </label>
                  <label className="flex items-start gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={autoSettle}
                      onChange={(e) => setAutoSettle(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Also let it <strong>pay automatically</strong> if I win. Leave this off and you&apos;ll
                      confirm the payment yourself.
                    </span>
                  </label>
                  <p className="text-xs text-ai-700">
                    Your agent re-bids the smallest amount needed to lead, never past your limit.
                  </p>
                </div>
              )}
            </div>

            {user && (
              <p className="mt-2 text-xs text-slate-500">
                Wallet: {wallet?.currency ?? "GBP"} {(wallet?.balance ?? 0).toFixed(2)}
              </p>
            )}
            <button
              onClick={() => bid.mutate()}
              disabled={bid.isPending || amount === null || (useAgent && !ceiling)}
              className="mt-3 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {bid.isPending ? "Bidding…" : useAgent ? "Bid & activate agent" : "Place bid"}
            </button>
          </div>
        )}

        {viewerMustSettle && (
          <div className="mt-4 rounded-xl border border-success-200 bg-success-50 p-3">
            <p className="text-sm font-medium text-success-800">
              {viewerWon ? "You won this auction" : "Your auction found a winner"}
            </p>
            <p className="mt-1 text-xs text-success-700">
              Pay {a.currency} {(data.feePreview?.buyerTotal ?? 0).toFixed(2)} from your wallet to complete it.
            </p>
            <button
              onClick={() => settle.mutate()}
              disabled={settle.isPending}
              className="mt-3 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {settle.isPending ? "Settling…" : "Confirm & pay"}
            </button>
          </div>
        )}

        {a.status === "SETTLED" && (
          <p className="mt-4 rounded-xl border border-success-200 bg-success-50 p-3 text-sm font-medium text-success-800">
            Settled: money has moved.
          </p>
        )}
        {a.status === "UNMET" && (
          <p className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            Closed with no bid that met the reserve.
          </p>
        )}

        {error && <p className="mt-3 text-xs text-danger-600">{error}</p>}
      </Card>
    </div>
  );
}
