"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { MarketplaceKind, MarketplaceListingPublic, PricingUnit } from "@gihtcx/shared";
import { MARKETPLACE_KINDS, PRICING_UNITS, PRICING_UNIT_LABELS, computeTradeFee , BUYER_FEE_LABEL, SELLER_FEE_LABEL } from "@gihtcx/shared";
import { api, ApiError } from "../../../lib/apiClient";
import { RequireAuth } from "../../../components/RequireAuth";
import { Card } from "../../../components/ui/Card";

export default function NewListingPage() {
  return (
    <RequireAuth>
      <NewListingInner />
    </RequireAuth>
  );
}

function NewListingInner() {
  const router = useRouter();
  const [kind, setKind] = useState<MarketplaceKind>("SERVICE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState(50);
  const [pricingUnit, setPricingUnit] = useState<PricingUnit>("HOURLY");
  const [stock, setStock] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const { data: mine } = useQuery<MarketplaceListingPublic[]>({
    queryKey: ["my-listings"],
    queryFn: () => api.get<MarketplaceListingPublic[]>("/market/mine"),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<MarketplaceListingPublic>("/market", {
        kind,
        title,
        description,
        category,
        price,
        pricingUnit,
        // Blank means unmetered, which is the norm for a service.
        stock: stock.trim() === "" ? null : Number(stock),
      }),
    onMutate: () => setError(null),
    onSuccess: (l) => router.push(`/market/${l.id}`),
    onError: (err) => setError(err instanceof ApiError ? err.message : "Couldn't create that listing"),
  });

  const quote = computeTradeFee(price);
  const canSubmit = title.length >= 3 && description.length >= 10 && category.length >= 2 && price > 0;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <Link href="/market" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">
          ← Products &amp; services
        </Link>
        <h1 className="font-display mb-1 text-2xl font-semibold">Sell a product or service</h1>
        <p className="mb-6 text-sm text-slate-500">
          List a physical or digital product, or sell your professional time by the hour, day or project.
        </p>

        <Card className="animate-fade-in-up p-5">
          <div className="mb-4 flex gap-2">
            {MARKETPLACE_KINDS.map((k) => (
              <button
                key={k}
                onClick={() => {
                  setKind(k);
                  // A product priced "per hour" is almost always a mistake.
                  setPricingUnit(k === "PRODUCT" ? "FIXED" : "HOURLY");
                }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  kind === k
                    ? "border-brand-500 bg-brand-50 text-brand-800"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {k === "PRODUCT" ? "📦 Product" : "🧑‍💼 Service"}
              </button>
            ))}
          </div>

          <label className="mb-3 block text-sm">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "PRODUCT" ? "e.g. Canon EOS R6 body" : "e.g. Cybersecurity consulting"}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="mb-3 block text-sm">
            Category
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={kind === "PRODUCT" ? "e.g. equipment" : "e.g. legal, photography, translation"}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="mb-3 block text-sm">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              placeholder="What exactly is included? Be specific — buyers commit based on this."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">{description.length} / 4000 (min 10)</span>
          </label>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block text-sm">
              Price (GBP)
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              Priced
              <select
                value={pricingUnit}
                onChange={(e) => setPricingUnit(e.target.value as PricingUnit)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                {PRICING_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {PRICING_UNIT_LABELS[u]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="mb-4 block text-sm">
            Stock {kind === "SERVICE" && <span className="text-slate-500">(leave blank for unlimited)</span>}
            <input
              type="number"
              min={0}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder={kind === "PRODUCT" ? "e.g. 5" : "unlimited"}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          {error && <p className="mb-3 text-sm text-danger-600">{error}</p>}
          <button
            onClick={() => create.mutate()}
            disabled={!canSubmit || create.isPending}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {create.isPending ? "Publishing…" : "Publish listing"}
          </button>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="animate-fade-in-up p-4" style={{ animationDelay: "60ms" }}>
          <h3 className="mb-2 font-semibold">What you&apos;ll receive</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Listed price</span>
              <span>GBP {quote.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Seller fee ({SELLER_FEE_LABEL})</span>
              <span className="text-danger-600">− GBP {quote.sellerFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
              <span>You receive</span>
              <span>GBP {quote.sellerProceeds.toFixed(2)}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            The buyer pays GBP {quote.buyerTotal.toFixed(2)} — {BUYER_FEE_LABEL} each side. Proceeds land in your wallet
            when the order is paid.
          </p>
        </Card>

        {mine && mine.length > 0 && (
          <Card className="animate-fade-in-up p-4" style={{ animationDelay: "120ms" }}>
            <h3 className="mb-2 font-semibold">Your listings ({mine.length})</h3>
            <ul className="space-y-2 text-sm">
              {mine.slice(0, 8).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2">
                  <Link href={`/market/${l.id}`} className="truncate hover:underline">
                    {l.title}
                  </Link>
                  <span className="shrink-0 text-xs text-slate-500">
                    {l.currency} {l.price.toFixed(2)}
                    {l.status !== "ACTIVE" && ` · ${l.status.toLowerCase()}`}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
