"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreditWallet, ExchangeQuote, ListingCategory, MoneyWallet } from "@gihtcx/shared";
import { LISTING_CATEGORIES, MIN_TOPUP_AMOUNT , BUYER_FEE_LABEL } from "@gihtcx/shared";
import { api, ApiError } from "../../lib/apiClient";
import { WithdrawPanel } from "../../components/wallet/WithdrawPanel";
import { StripePaymentForm } from "../../components/StripePaymentForm";
import { RequireAuth } from "../../components/RequireAuth";
import { Card } from "../../components/ui/Card";
import { Spinner } from "../../components/ui/Spinner";
import { EmptyState } from "../../components/ui/EmptyState";
import { AnimatedNumber } from "../../components/ui/AnimatedNumber";
import { AiBadge, ConfidenceMeter } from "../../components/ai/AiBadge";

const CATEGORY_LABELS: Record<string, string> = {
  ROOM: "🏨 Room hours",
  CAR: "🚗 Car hours",
  TRAVEL_SERVICE: "🧭 Travel hours",
};

const KIND_LABELS: Record<string, string> = {
  PURCHASE: "Purchased",
  REDEEM: "Redeemed on a booking",
  TRANSFER_IN: "Received",
  TRANSFER_OUT: "Sent",
  EXCHANGE_IN: "Exchanged in",
  EXCHANGE_OUT: "Exchanged out",
  TRADE_FEE: "Exchange fee",
  REFUND: "Returned",
  EXPIRY: "Expired",
};

export default function WalletPage() {
  return (
    <RequireAuth>
      <WalletInner />
    </RequireAuth>
  );
}

function WalletInner() {
  const qc = useQueryClient();
  const { data, isPending, error, refetch } = useQuery<CreditWallet>({
    queryKey: ["wallet"],
    queryFn: () => api.get<CreditWallet>("/credits/wallet"),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["wallet"] });
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Spinner /> <span className="ml-2 text-sm">Loading your wallet…</span>
      </div>
    );
  }
  if (error || !data) {
    return (
      <EmptyState
        icon="⚠️"
        title="We couldn't load your wallet"
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

  return (
    <div>
      <h1 className="font-display mb-1 text-2xl font-semibold">Wallet</h1>
      <p className="mb-6 text-sm text-slate-500">
        Money and hours in one place. Every hour you buy is yours to keep, spend, gift or exchange —
        not tied to a single booking.
      </p>

      <MoneySection />
      <h2 className="font-display mb-3 mt-10 text-lg font-semibold">Time credits</h2>

      {/* Headline balances */}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div
          className="animate-fade-in-up rounded-2xl p-4 text-white shadow-card"
          style={{ backgroundImage: "linear-gradient(135deg,#00665e,#004c46 55%,#632bc0)" }}
        >
          <p className="text-xs uppercase tracking-wide text-white/80">Hours held</p>
          <p className="mt-1 text-2xl font-semibold">
            <AnimatedNumber value={data.totalHours} decimals={2} />
          </p>
        </div>
        <div className="animate-fade-in-up rounded-2xl border border-slate-200 bg-white p-4 shadow-card" style={{ animationDelay: "60ms" }}>
          <p className="text-xs uppercase tracking-wide text-slate-500">Estimated value</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {data.currency} <AnimatedNumber value={data.totalEstimatedValue} decimals={2} />
          </p>
        </div>
        <div className="animate-fade-in-up rounded-2xl border border-slate-200 bg-white p-4 shadow-card" style={{ animationDelay: "120ms" }}>
          <p className="text-xs uppercase tracking-wide text-slate-500">Buckets</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            <AnimatedNumber value={data.balances.length} />
          </p>
        </div>
      </div>

      {/* Per-category balances */}
      <section className="mb-8">
        <h2 className="font-display mb-3 text-lg font-semibold">Your hours</h2>
        {data.balances.length === 0 ? (
          <EmptyState
            icon="⏳"
            title="No time credits yet"
            description="Buy hours below and redeem them against any listing in that category, whenever suits you."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {data.balances.map((b, i) => (
              <Card
                key={b.category}
                className="animate-fade-in-up p-4 transition-shadow hover:shadow-card-hover"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <p className="text-sm text-slate-500">{CATEGORY_LABELS[b.category] ?? b.category}</p>
                <p className="mt-1 text-xl font-semibold">
                  <AnimatedNumber value={b.hours} decimals={2} />
                  <span className="text-sm font-normal text-slate-500"> hrs</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  ≈ {b.currency} {b.estimatedValue.toFixed(2)} · avg {b.currency} {b.avgUnitValue.toFixed(2)}/hr
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <BuyHours onDone={invalidate} />
        <GiftHours wallet={data} onDone={invalidate} />
        <ExchangeHours wallet={data} onDone={invalidate} />
      </div>

      {/* Ledger */}
      <section className="mt-8">
        <h2 className="font-display mb-3 text-lg font-semibold">History</h2>
        <div className="overflow-x-auto">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">What</th>
                  <th className="px-3 py-2">Bucket</th>
                  <th className="px-3 py-2 text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      {KIND_LABELS[r.kind] ?? r.kind}
                      {r.counterpartyEmail && <span className="text-slate-500"> · {r.counterpartyEmail}</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{CATEGORY_LABELS[r.category] ?? r.category}</td>
                    <td className={`px-3 py-2 text-right font-medium ${r.hours < 0 ? "text-danger-600" : "text-success-700"}`}>
                      {r.hours > 0 ? "+" : ""}
                      {r.hours.toFixed(2)}
                    </td>
                  </tr>
                ))}
                {data.recent.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500">
                      Nothing here yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

const WALLET_KIND_LABELS: Record<string, string> = {
  TOPUP: "Topped up",
  PURCHASE: "Marketplace purchase",
  SALE_PROCEEDS: "Sale proceeds",
  SALE_CLAWBACK: "Reversed (refund/chargeback)",
  REFUND: "Refund",
  FEE: "Platform fee",
  PAYOUT: "Withdrawal",
};

/** Money balance + card top-up. Separate query from the credit wallet so one failing doesn't blank the other. */
function MoneySection() {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(25);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const err = useFormError();

  const { data, isPending } = useQuery<MoneyWallet>({
    queryKey: ["money-wallet"],
    queryFn: () => api.get<MoneyWallet>("/wallet"),
  });

  const start = useMutation({
    mutationFn: () =>
      api.post<{ clientSecret: string | null; simulated: boolean; amount: number; currency: string }>(
        "/wallet/topup",
        { amount }
      ),
    onMutate: () => {
      err.clear();
      setNotice(null);
      setClientSecret(null);
    },
    onSuccess: (q) => {
      if (q.clientSecret) {
        setClientSecret(q.clientSecret);
      } else {
        // No Stripe keys configured — say so rather than implying money landed.
        setNotice(
          `Test mode: a ${q.currency} ${q.amount.toFixed(2)} top-up was created but no card was charged, so the balance is unchanged.`
        );
      }
    },
    onError: err.show,
  });

  const currency = data?.currency ?? "GBP";

  return (
    <section>
      <h2 className="font-display mb-3 text-lg font-semibold">Money</h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div
          className="animate-fade-in-up rounded-2xl p-4 text-white shadow-card lg:col-span-2"
          style={{ backgroundImage: "linear-gradient(135deg,#00665e,#004c46 55%,#005d8f)" }}
        >
          <p className="text-xs uppercase tracking-wide text-white/80">Wallet balance</p>
          <p className="mt-1 text-3xl font-semibold">
            {currency} {isPending ? "—" : <AnimatedNumber value={data?.balance ?? 0} decimals={2} />}
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/80">
            <span>
              Earned from sales: {currency} {(data?.lifetimeEarnings ?? 0).toFixed(2)}
            </span>
            <span>
              Spent: {currency} {(data?.lifetimeSpend ?? 0).toFixed(2)}
            </span>
          </div>
        </div>

        <Card className="animate-fade-in-up p-4" style={{ animationDelay: "60ms" }}>
          <h3 className="mb-3 font-semibold">Top up</h3>
          {clientSecret ? (
            <>
              <p className="mb-2 text-sm text-slate-600">
                Adding {currency} {amount.toFixed(2)}
              </p>
              <StripePaymentForm
                clientSecret={clientSecret}
                label={`Top up ${currency} ${amount.toFixed(2)}`}
                onSucceeded={() => {
                  setClientSecret(null);
                  setNotice("Payment received — your balance updates once the confirmation lands.");
                  // The webhook credits the ledger, so refetch shortly after.
                  setTimeout(() => qc.invalidateQueries({ queryKey: ["money-wallet"] }), 1500);
                }}
              />
              <button
                onClick={() => setClientSecret(null)}
                className="mt-2 text-xs text-slate-500 underline-offset-2 hover:underline"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <label className="mb-3 block text-sm">
                Amount ({currency})
                <input
                  type="number"
                  min={MIN_TOPUP_AMOUNT}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
                />
              </label>
              <div className="mb-3 flex gap-2">
                {[10, 25, 50, 100].map((v) => (
                  <button
                    key={v}
                    onClick={() => setAmount(v)}
                    className={`flex-1 rounded-lg border px-2 py-1 text-xs transition ${
                      amount === v
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="mb-3 text-xs text-slate-500">
                No fee to add money — funding your own account isn&apos;t a trade.
              </p>
              <button
                onClick={() => start.mutate()}
                disabled={start.isPending || amount < MIN_TOPUP_AMOUNT}
                className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
              >
                {start.isPending ? "Working…" : "Continue to card"}
              </button>
            </>
          )}
          {err.message && <p className="mt-2 text-xs text-danger-600">{err.message}</p>}
          {notice && <p className="mt-2 animate-fade-in text-xs text-success-700">{notice}</p>}
        </Card>
      </div>

      {data && data.recent.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">What</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.slice(0, 8).map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      {WALLET_KIND_LABELS[r.kind] ?? r.kind}
                      {r.counterpartyEmail && <span className="text-slate-500"> · {r.counterpartyEmail}</span>}
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${r.amount < 0 ? "text-danger-600" : "text-success-700"}`}>
                      {r.amount > 0 ? "+" : ""}
                      {r.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Withdrawals. Sellers could previously accrue proceeds with no way out. */}
      <div className="mt-4">
        <WithdrawPanel balance={data?.balance ?? 0} currency={currency} />
      </div>
    </section>
  );
}

function useFormError() {
  const [message, setMessage] = useState<string | null>(null);
  const show = (err: unknown) =>
    setMessage(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
  return { message, show, clear: () => setMessage(null) };
}

function BuyHours({ onDone }: { onDone: () => void }) {
  const [category, setCategory] = useState<ListingCategory>("ROOM");
  const [hours, setHours] = useState(4);
  const err = useFormError();
  const [ok, setOk] = useState<string | null>(null);

  const buy = useMutation({
    mutationFn: () =>
      api.post<{ total: number; currency: string; simulated: boolean; clientSecret: string | null }>(
        "/credits/purchase",
        { category, hours }
      ),
    onMutate: () => {
      err.clear();
      setOk(null);
    },
    onSuccess: (q: { total: number; currency: string; simulated: boolean; clientSecret: string | null }) => {
      // A real card charge still needs Stripe Elements; until that's wired for
      // credits, say so plainly rather than implying the hours have landed.
      setOk(
        q.simulated
          ? `Reserved ${hours}h for ${q.currency} ${q.total.toFixed(2)} (test mode — no card charged).`
          : `Payment of ${q.currency} ${q.total.toFixed(2)} created. Complete the card payment to receive your hours.`
      );
      onDone();
    },
    onError: err.show,
  });

  return (
    <Card className="animate-fade-in-up p-4">
      <h3 className="mb-3 font-semibold">Buy hours</h3>
      <label className="mb-2 block text-sm">
        Category
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ListingCategory)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
        >
          {LISTING_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c] ?? c}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-3 block text-sm">
        Hours
        <input
          type="number"
          min={0.25}
          step={0.25}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
        />
      </label>
      <p className="mb-3 text-xs text-slate-500">Priced at the live average rate for that category, plus a {BUYER_FEE_LABEL} buyer fee.</p>
      <button
        onClick={() => buy.mutate()}
        disabled={buy.isPending}
        className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
      >
        {buy.isPending ? "Working…" : "Buy hours"}
      </button>
      {err.message && <p className="mt-2 text-xs text-danger-600">{err.message}</p>}
      {ok && <p className="mt-2 animate-fade-in text-xs text-success-700">{ok}</p>}
    </Card>
  );
}

function GiftHours({ wallet, onDone }: { wallet: CreditWallet; onDone: () => void }) {
  const [toEmail, setToEmail] = useState("");
  const [category, setCategory] = useState<ListingCategory>(
    (wallet.balances[0]?.category as ListingCategory) ?? "ROOM"
  );
  const [hours, setHours] = useState(1);
  const err = useFormError();
  const [ok, setOk] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () => api.post("/credits/transfer", { toEmail, category, hours }),
    onMutate: () => {
      err.clear();
      setOk(null);
    },
    onSuccess: () => {
      setOk(`Sent ${hours}h to ${toEmail}.`);
      setToEmail("");
      onDone();
    },
    onError: err.show,
  });

  return (
    <Card className="animate-fade-in-up p-4" style={{ animationDelay: "60ms" }}>
      <h3 className="mb-3 font-semibold">Gift hours</h3>
      <label className="mb-2 block text-sm">
        Recipient email
        <input
          type="email"
          value={toEmail}
          onChange={(e) => setToEmail(e.target.value)}
          placeholder="them@example.com"
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
        />
      </label>
      <label className="mb-2 block text-sm">
        From bucket
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ListingCategory)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
        >
          {LISTING_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c] ?? c}
            </option>
          ))}
        </select>
      </label>
      <label className="mb-3 block text-sm">
        Hours
        <input
          type="number"
          min={0.25}
          step={0.25}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
        />
      </label>
      <p className="mb-3 text-xs text-slate-500">Gifts are free — no platform fee on a transfer.</p>
      <button
        onClick={() => send.mutate()}
        disabled={send.isPending || !toEmail}
        className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {send.isPending ? "Sending…" : "Send gift"}
      </button>
      {err.message && <p className="mt-2 text-xs text-danger-600">{err.message}</p>}
      {ok && <p className="mt-2 animate-fade-in text-xs text-success-700">{ok}</p>}
    </Card>
  );
}

function ExchangeHours({ wallet, onDone }: { wallet: CreditWallet; onDone: () => void }) {
  const [fromCategory, setFrom] = useState<ListingCategory>(
    (wallet.balances[0]?.category as ListingCategory) ?? "ROOM"
  );
  const [toCategory, setTo] = useState<ListingCategory>("CAR");
  const [hours, setHours] = useState(1);
  const [quote, setQuote] = useState<ExchangeQuote | null>(null);
  const err = useFormError();
  const [ok, setOk] = useState<string | null>(null);

  const getQuote = useMutation({
    mutationFn: () =>
      api.get<ExchangeQuote>(
        `/credits/exchange-quote?fromCategory=${fromCategory}&toCategory=${toCategory}&hours=${hours}`
      ),
    onMutate: () => {
      err.clear();
      setOk(null);
      setQuote(null);
    },
    onSuccess: setQuote,
    onError: err.show,
  });

  const doExchange = useMutation({
    mutationFn: () =>
      api.post<{ quote: ExchangeQuote }>("/credits/exchange", { fromCategory, toCategory, hours }),
    onMutate: () => err.clear(),
    onSuccess: (r: { quote: ExchangeQuote }) => {
      setOk(`Exchanged ${hours}h into ${r.quote.hoursOut.toFixed(2)}h of ${toCategory}.`);
      setQuote(null);
      onDone();
    },
    onError: err.show,
  });

  return (
    <Card className="animate-fade-in-up p-4" style={{ animationDelay: "120ms" }}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">Exchange</h3>
        <AiBadge label="AI rate" />
      </div>
      <div className="mb-2 grid grid-cols-2 gap-2">
        <label className="block text-sm">
          From
          <select
            value={fromCategory}
            onChange={(e) => setFrom(e.target.value as ListingCategory)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
          >
            {LISTING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          To
          <select
            value={toCategory}
            onChange={(e) => setTo(e.target.value as ListingCategory)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
          >
            {LISTING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="mb-3 block text-sm">
        Hours to exchange
        <input
          type="number"
          min={0.25}
          step={0.25}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5"
        />
      </label>

      {quote && (
        <div className="mb-3 animate-fade-in rounded-xl border border-ai-200 bg-ai-50/60 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-ai-800">
              → {quote.hoursOut.toFixed(2)} hrs
            </span>
            <ConfidenceMeter level={quote.confidence} />
          </div>
          <p className="mt-1 text-xs text-ai-700">
            Rate {quote.rate.toFixed(3)} · fee {quote.feeHours.toFixed(2)}h
          </p>
          <p className="mt-1 text-xs text-slate-600">{quote.reasoning}</p>
          <p className="mt-1 text-xs text-slate-500">Quoted by {quote.quotedBy}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => getQuote.mutate()}
          disabled={getQuote.isPending || fromCategory === toCategory}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {getQuote.isPending ? "Quoting…" : "Get quote"}
        </button>
        <button
          onClick={() => doExchange.mutate()}
          disabled={!quote || doExchange.isPending || quote.hoursOut <= 0}
          className="flex-1 rounded-lg bg-ai-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-ai-700 disabled:opacity-50"
        >
          {doExchange.isPending ? "Exchanging…" : "Exchange"}
        </button>
      </div>
      {fromCategory === toCategory && (
        <p className="mt-2 text-xs text-slate-500">Pick two different buckets to exchange between.</p>
      )}
      {err.message && <p className="mt-2 text-xs text-danger-600">{err.message}</p>}
      {ok && <p className="mt-2 animate-fade-in text-xs text-success-700">{ok}</p>}
    </Card>
  );
}
