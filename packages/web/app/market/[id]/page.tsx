"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MarketplaceListingPublic,
  MarketplaceOrderPublic,
  MoneyWallet,
  OrderPaymentMethod,
} from "@gihtcx/shared";
import { PRICING_UNIT_LABELS, computeTradeFee , BUYER_FEE_LABEL, SELLER_FEE_LABEL } from "@gihtcx/shared";
import { api, ApiError } from "../../../lib/apiClient";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { Spinner } from "../../../components/ui/Spinner";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ListingImage } from "../../../components/ui/ListingImage";
import { StripePaymentForm } from "../../../components/StripePaymentForm";

export default function MarketListingPage() {
  const { id } = useParams<{ id: string }>();
  const { data: user } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();

  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<OrderPaymentMethod>("WALLET");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [placed, setPlaced] = useState<MarketplaceOrderPublic | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: listing, isPending } = useQuery<MarketplaceListingPublic>({
    queryKey: ["market-listing", id],
    queryFn: () => api.get<MarketplaceListingPublic>(`/market/${id}`),
  });

  const { data: wallet } = useQuery<MoneyWallet>({
    queryKey: ["money-wallet"],
    queryFn: () => api.get<MoneyWallet>("/wallet"),
    retry: false,
    enabled: Boolean(user),
  });

  const buy = useMutation({
    mutationFn: () =>
      api.post<MarketplaceOrderPublic>("/market/orders", { listingId: id, quantity, paymentMethod }),
    onMutate: () => setError(null),
    onSuccess: (order) => {
      setPlaced(order);
      if (order.clientSecret) setClientSecret(order.clientSecret);
      qc.invalidateQueries({ queryKey: ["money-wallet"] });
      qc.invalidateQueries({ queryKey: ["market-listing", id] });
    },
    onError: (err) => {
      // Anonymous visitors get sent to log in and back, not shown a raw 401.
      if (err instanceof ApiError && err.status === 401) {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Couldn't place that order");
    },
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Spinner /> <span className="ml-2 text-sm">Loading…</span>
      </div>
    );
  }
  if (!listing) {
    return (
      <EmptyState
        icon="🔍"
        title="Listing not found"
        description="It may have been removed or sold out."
        action={
          <Link href="/market" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">
            Back to marketplace
          </Link>
        }
      />
    );
  }

  // Quoted client-side from the shared fee helper so the buyer sees the exact
  // same arithmetic the server will apply — no surprise at checkout.
  const quote = computeTradeFee(Math.round(listing.price * quantity * 100) / 100);
  const isOwn = user?.id === listing.sellerId;
  const soldOut = listing.status !== "ACTIVE" || (listing.stock !== null && listing.stock <= 0);
  const walletShort = paymentMethod === "WALLET" && (wallet?.balance ?? 0) < quote.buyerTotal;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <Link href="/market" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">
          ← Products &amp; services
        </Link>
        <div className="animate-fade-in-up overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <div className="relative h-64">
            <ListingImage src={listing.imageUrl} alt={listing.title} seed={listing.title} />
            <span className="absolute right-3 top-3 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 backdrop-blur">
              {listing.kind === "PRODUCT" ? "📦 Product" : "🧑‍💼 Service"}
            </span>
          </div>
          <div className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h1 className="text-2xl font-semibold">{listing.title}</h1>
              {listing.sellerVerified && <Badge tone="success">✓ Verified seller</Badge>}
            </div>
            <p className="mt-1 text-sm capitalize text-slate-400">{listing.category}</p>
            <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{listing.description}</p>
            <p className="mt-4 text-xs text-slate-400">
              Sold by {listing.sellerHandle}
              {listing.sellerVerified && " · verified"}
            </p>
          </div>
        </div>
      </div>

      <Card className="animate-fade-in-up self-start p-5" style={{ animationDelay: "60ms" }}>
        <p className="text-2xl font-semibold">
          {listing.currency} {listing.price.toFixed(2)}
          <span className="text-sm font-normal text-slate-400"> {PRICING_UNIT_LABELS[listing.pricingUnit]}</span>
        </p>
        {listing.stock !== null && (
          <p className="mt-1 text-xs text-slate-500">{listing.stock} available</p>
        )}

        {placed && placed.status === "PAID" ? (
          <div className="mt-4 animate-fade-in rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-sm font-medium text-emerald-800">Order confirmed</p>
            <p className="mt-1 text-xs text-emerald-700">
              Paid {placed.currency} {placed.buyerTotal.toFixed(2)} from your wallet.
            </p>
            <Link href="/market/orders" className="mt-2 inline-block text-xs font-medium text-emerald-800 underline">
              View my orders
            </Link>
          </div>
        ) : clientSecret ? (
          <div className="mt-4">
            <p className="mb-2 text-sm text-slate-600">
              Pay {listing.currency} {quote.buyerTotal.toFixed(2)} by card
            </p>
            <StripePaymentForm
              clientSecret={clientSecret}
              label={`Pay ${listing.currency} ${quote.buyerTotal.toFixed(2)}`}
              onSucceeded={() => {
                setClientSecret(null);
                setPlaced((p) => (p ? { ...p, status: "PAID" } : p));
                setTimeout(() => qc.invalidateQueries({ queryKey: ["market-orders"] }), 1500);
              }}
            />
          </div>
        ) : (
          <>
            <label className="mt-4 block text-sm">
              Quantity
              <input
                type="number"
                min={1}
                max={listing.stock ?? 999}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
              />
            </label>

            <div className="mt-4 space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal</span>
                <span>
                  {listing.currency} {quote.subtotal.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Buyer fee ({BUYER_FEE_LABEL})</span>
                <span>
                  {listing.currency} {quote.buyerFee.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
                <span>You pay</span>
                <span>
                  {listing.currency} {quote.buyerTotal.toFixed(2)}
                </span>
              </div>
              <p className="pt-1 text-xs text-slate-400">
                The seller receives {listing.currency} {quote.sellerProceeds.toFixed(2)} after their {SELLER_FEE_LABEL} fee.
              </p>
            </div>

            <div className="mt-4">
              <p className="mb-1 text-sm text-slate-600">Pay with</p>
              <div className="flex gap-2">
                {(["WALLET", "CARD"] as OrderPaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPaymentMethod(m)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      paymentMethod === m
                        ? "border-brand-500 bg-brand-50 text-brand-800"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {m === "WALLET" ? "Wallet" : "Card"}
                  </button>
                ))}
              </div>
              {user && paymentMethod === "WALLET" && (
                <p className="mt-1 text-xs text-slate-400">
                  Balance: {wallet?.currency ?? "GBP"} {(wallet?.balance ?? 0).toFixed(2)}
                </p>
              )}
            </div>

            {isOwn && <p className="mt-3 text-xs text-amber-700">This is your own listing.</p>}
            {soldOut && <p className="mt-3 text-xs text-red-600">This listing isn&apos;t available.</p>}
            {walletShort && !soldOut && !isOwn && (
              <p className="mt-3 text-xs text-amber-700">
                Not enough in your wallet —{" "}
                <Link href="/wallet" className="font-medium underline">
                  top up
                </Link>{" "}
                or pay by card.
              </p>
            )}

            <button
              onClick={() => buy.mutate()}
              disabled={buy.isPending || isOwn || soldOut}
              className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
            >
              {buy.isPending ? "Placing order…" : `Buy · ${listing.currency} ${quote.buyerTotal.toFixed(2)}`}
            </button>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </>
        )}
      </Card>
    </div>
  );
}
