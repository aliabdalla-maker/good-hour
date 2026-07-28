"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { MarketplaceOrderPublic } from "@gihtcx/shared";
import { api } from "../../../lib/apiClient";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { RequireAuth } from "../../../components/RequireAuth";
import { Spinner } from "../../../components/ui/Spinner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Badge } from "../../../components/ui/Badge";

const STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  PAID: "success",
  PENDING_PAYMENT: "warning",
  CANCELLED: "neutral",
  REFUNDED: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  PAID: "Paid",
  PENDING_PAYMENT: "Awaiting payment",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export default function OrdersPage() {
  return (
    <RequireAuth>
      <OrdersInner />
    </RequireAuth>
  );
}

function OrdersInner() {
  const { data: user } = useCurrentUser();
  const { data, isPending, error, refetch } = useQuery<MarketplaceOrderPublic[]>({
    queryKey: ["market-orders"],
    queryFn: () => api.get<MarketplaceOrderPublic[]>("/market/orders"),
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Spinner /> <span className="ml-2 text-sm">Loading orders…</span>
      </div>
    );
  }
  if (error || !data) {
    return (
      <EmptyState
        icon="⚠️"
        title="We couldn't load your orders"
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
    );
  }

  const bought = data.filter((o) => o.buyerId === user?.id);
  const sold = data.filter((o) => o.sellerId === user?.id);

  return (
    <div>
      <Link href="/market" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">
        ← Products &amp; services
      </Link>
      <h1 className="mb-6 text-2xl font-semibold">My orders</h1>

      {data.length === 0 && (
        <EmptyState
          icon="🧾"
          title="No orders yet"
          description="Anything you buy or sell on the marketplace shows up here."
          action={
            <Link href="/market" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">
              Browse the marketplace
            </Link>
          }
        />
      )}

      <OrderTable title="Bought" rows={bought} mode="buyer" />
      <OrderTable title="Sold" rows={sold} mode="seller" />
    </div>
  );
}

function OrderTable({
  title,
  rows,
  mode,
}: {
  title: string;
  rows: MarketplaceOrderPublic[];
  mode: "buyer" | "seller";
}) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-8 animate-fade-in-up">
      <h2 className="mb-3 text-lg font-semibold">
        {title} ({rows.length})
      </h2>
      <div className="overflow-x-auto">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <table className="w-full min-w-[38rem] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Listing</th>
                <th className="px-3 py-2">{mode === "buyer" ? "Seller" : "Buyer"}</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">{mode === "buyer" ? "You paid" : "You received"}</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                  <td className="px-3 py-2 text-slate-500">{new Date(o.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <Link href={`/market/${o.listingId}`} className="hover:underline">
                      {o.listingTitle}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{o.counterpartyEmail}</td>
                  <td className="px-3 py-2 text-right">{o.quantity}</td>
                  <td className="px-3 py-2 text-right font-medium">
                    {o.currency}{" "}
                    {(mode === "buyer" ? o.buyerTotal : o.sellerProceeds).toFixed(2)}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={STATUS_TONE[o.status] ?? "neutral"}>
                      {STATUS_LABEL[o.status] ?? o.status}
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
