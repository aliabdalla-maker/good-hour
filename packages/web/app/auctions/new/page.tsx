"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import type { AuctionKind, AuctionPublic } from "@gihtcx/shared";
import { AUCTION_KINDS, MIN_AUCTION_MINUTES, computeTradeFee } from "@gihtcx/shared";
import { api, ApiError } from "../../../lib/apiClient";
import { RequireAuth } from "../../../components/RequireAuth";
import { Card } from "../../../components/ui/Card";

const DURATIONS = [
  { label: "1 hour", minutes: 60 },
  { label: "6 hours", minutes: 360 },
  { label: "24 hours", minutes: 1440 },
  { label: "3 days", minutes: 4320 },
  { label: "7 days", minutes: 10080 },
];

export default function NewAuctionPage() {
  return (
    <RequireAuth>
      <NewAuctionInner />
    </RequireAuth>
  );
}

function NewAuctionInner() {
  const router = useRouter();
  const [kind, setKind] = useState<AuctionKind>("FORWARD");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [hours, setHours] = useState(3);
  const [reservePerHour, setReserve] = useState(60);
  const [minutes, setMinutes] = useState(1440);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post<AuctionPublic>("/auctions", {
        kind,
        title,
        description,
        category,
        hours,
        reservePerHour,
        closesAt: new Date(Date.now() + minutes * 60_000).toISOString(),
      }),
    onMutate: () => setError(null),
    onSuccess: (a) => router.push(`/auctions/${a.id}`),
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't start that auction"),
  });

  const total = Math.round(reservePerHour * hours * 100) / 100;
  const fee = computeTradeFee(total);
  const canSubmit =
    title.length >= 3 && description.length >= 10 && category.length >= 2 && hours > 0 && reservePerHour > 0;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <Link href="/auctions" className="mb-3 inline-block text-sm text-slate-500 hover:text-slate-800">
          ← Hourly auctions
        </Link>
        <h1 className="font-display mb-1 text-2xl font-semibold">Start an hourly auction</h1>
        <p className="mb-6 text-sm text-slate-500">
          Auction hours of a product or service — either let buyers bid the price up, or let sellers bid it down.
        </p>

        <Card className="animate-fade-in-up p-5">
          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {AUCTION_KINDS.map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-lg border p-3 text-start text-sm transition ${
                  kind === k
                    ? "border-brand-600 bg-brand-50 text-brand-900"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <span className="block font-medium">
                  {k === "FORWARD" ? "⬆ I'm selling" : "⬇ I'm buying"}
                </span>
                <span className="mt-0.5 block text-xs">
                  {k === "FORWARD"
                    ? "Buyers bid up. Highest bid wins."
                    : "Sellers bid down. Lowest bid wins."}
                </span>
              </button>
            ))}
          </div>

          <label className="mb-3 block text-sm">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={kind === "FORWARD" ? "e.g. 3 hours of legal review" : "e.g. Need a van + driver, 4 hours"}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="mb-3 block text-sm">
            Category
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. legal, photography, transport"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="mb-3 block text-sm">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Exactly what's included. Bidders commit real money based on this."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block text-sm">
              Hours
              <input
                type="number"
                min={0.25}
                step={0.25}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              {kind === "FORWARD" ? "Reserve (min)" : "Budget (max)"} GBP/hr
              <input
                type="number"
                min={0.01}
                step={0.5}
                value={reservePerHour}
                onChange={(e) => setReserve(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <div className="mb-4">
            <p className="mb-1 text-sm">Runs for</p>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.minutes}
                  onClick={() => setMinutes(d.minutes)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    minutes === d.minutes
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Closes {new Date(Date.now() + minutes * 60_000).toLocaleString()} · minimum{" "}
              {MIN_AUCTION_MINUTES} minutes
            </p>
          </div>

          {error && <p className="mb-3 text-sm text-danger-600">{error}</p>}
          <button
            onClick={() => create.mutate()}
            disabled={!canSubmit || create.isPending}
            className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {create.isPending ? "Opening…" : "Open auction"}
          </button>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="animate-fade-in-up p-4" style={{ animationDelay: "60ms" }}>
          <h3 className="mb-2 font-semibold">At the reserve price</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">
                {hours}h × GBP {reservePerHour.toFixed(2)}
              </span>
              <span>GBP {fee.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Buyer pays</span>
              <span className="font-medium">GBP {fee.buyerTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Seller receives</span>
              <span className="font-medium">GBP {fee.sellerProceeds.toFixed(2)}</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {kind === "FORWARD"
              ? "Bids can only go higher, so this is your floor."
              : "Bids can only go lower, so this is your worst case."}
          </p>
        </Card>

        <Card className="animate-fade-in-up p-4" style={{ animationDelay: "120ms" }}>
          <h3 className="mb-2 font-semibold">How bidding works</h3>
          <ul className="space-y-1.5 text-xs text-slate-600">
            <li>• Bidders can set a ceiling and let an AI agent bid for them.</li>
            <li>• Agents re-bid the smallest step needed to lead, never past their limit.</li>
            <li>• Two agents bidding against each other settle it between themselves.</li>
            <li>• At close, the best bid that clears your reserve wins. Otherwise nothing happens.</li>
            <li>• Payment is from the buyer&apos;s wallet — automatic only if they opted in.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
