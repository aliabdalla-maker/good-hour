"use client";

import Link from "next/link";
import type { ErpLiquidity } from "@gihtcx/shared";
import { LIQUIDITY_VERDICT_LABELS } from "@gihtcx/shared";
import { Card } from "../ui/Card";
import { AnimatedNumber } from "../ui/AnimatedNumber";

/**
 * Liquidity — FR-030 — rendered above everything else on the ERP page.
 *
 * The design brief for this panel is unusual: it has to be *honest when the
 * numbers are bad*. Dashboards default to flattering their operator — big totals,
 * green accents, growth arrows — and this platform ran a full build with a
 * capability dashboard reading healthy while supply and demand were both zero.
 *
 * So the verdict drives the styling. At NO_MARKET the panel is deliberately
 * `danger`-toned and says so in words; there is no arrangement of zeroes that can
 * be made to look like progress here.
 */

const VERDICT_TONE: Record<
  ErpLiquidity["verdict"],
  { border: string; bg: string; text: string; dot: string; icon: string }
> = {
  NO_MARKET: {
    border: "border-danger-200",
    bg: "bg-danger-50",
    text: "text-danger-800",
    dot: "bg-danger-600",
    icon: "⚠",
  },
  NO_SUPPLY: {
    border: "border-warning-200",
    bg: "bg-warning-50",
    text: "text-warning-800",
    dot: "bg-warning-600",
    icon: "◔",
  },
  NO_DEMAND: {
    border: "border-warning-200",
    bg: "bg-warning-50",
    text: "text-warning-800",
    dot: "bg-warning-600",
    icon: "◔",
  },
  TRADING: {
    border: "border-success-200",
    bg: "bg-success-50",
    text: "text-success-800",
    dot: "bg-success-600",
    icon: "✓",
  },
};

const NEXT_ACTION: Record<ErpLiquidity["verdict"], string> = {
  NO_MARKET:
    "Nothing else on this page can improve until one seller lists real inventory. Fee revenue, agent accuracy and credit liability are all functions of a market that does not exist yet.",
  NO_SUPPLY:
    "There is interest with nothing to buy. Seller acquisition is the only work that changes this number.",
  NO_DEMAND:
    "There is inventory nobody has bought. The bottleneck is buyers, not features.",
  TRADING:
    "The market is live. Update FR-030 in docs/REQUIREMENTS.md with the current figures.",
};

function Metric({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-xl font-semibold ${value === 0 && !muted ? "text-slate-400" : "text-slate-900"}`}>
        <AnimatedNumber value={value} />
      </p>
    </div>
  );
}

export function LiquidityPanel({ liquidity }: { liquidity: ErpLiquidity }) {
  const tone = VERDICT_TONE[liquidity.verdict];
  const coverage = Math.round(liquidity.agentOutcomeCoverage * 100);

  return (
    <section className="mb-8 animate-fade-in-up">
      <div className={`rounded-2xl border ${tone.border} ${tone.bg} p-5 shadow-card`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
            <h2 className="font-display font-semibold text-slate-900">Liquidity</h2>
            <span className="rounded-md bg-white/70 px-2 py-0.5 text-xs font-medium text-slate-600">
              FR-030 · Must
            </span>
          </div>
          <p className={`text-sm font-semibold ${tone.text}`}>
            <span aria-hidden="true">{tone.icon}</span>{" "}
            {LIQUIDITY_VERDICT_LABELS[liquidity.verdict]}
          </p>
        </div>

        <p className={`mt-2 text-sm ${tone.text}`}>{NEXT_ACTION[liquidity.verdict]}</p>

        <div className="mt-4 grid grid-cols-2 gap-4 rounded-xl bg-white/70 p-4 sm:grid-cols-4">
          <Metric label="Supply" value={liquidity.supply} />
          <Metric label="Demand" value={liquidity.demand} />
          <Metric label="Sellers" value={liquidity.sellers} />
          <Metric label="Paid orders" value={liquidity.ordersPaid} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="p-3">
          <Metric label="Active units" value={liquidity.activeUnits} muted />
        </Card>
        <Card className="p-3">
          <Metric label="Listings" value={liquidity.activeListings} muted />
        </Card>
        <Card className="p-3">
          <Metric label="Auctions" value={liquidity.auctionsCreated} muted />
        </Card>
        <Card className="p-3">
          <Metric label="Bids" value={liquidity.bidsPlaced} muted />
        </Card>
        <Card className="p-3">
          <Metric label="Proxy mandates" value={liquidity.proxyMandates} muted />
        </Card>
        <Card className="p-3">
          <Metric label="Bookings" value={liquidity.bookingsConfirmed} muted />
        </Card>
      </div>

      {/* Agent-decision feedback coverage. Surfaced next to liquidity because
          both answer the same kind of question: is the thing we built actually
          being used, and do we know whether it works? */}
      <Card className="mt-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-slate-800">
            Agent decisions with a recorded outcome
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {liquidity.agentDecisions === 0
              ? "no decisions yet"
              : `${coverage}% of ${liquidity.agentDecisions}`}
          </p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-700 ${coverage < 25 ? "bg-warning-600" : "bg-success-600"}`}
            style={{ width: `${Math.max(coverage, liquidity.agentDecisions > 0 ? 2 : 0)}%` }}
          />
        </div>
        {liquidity.agentDecisions > 0 && coverage < 25 && (
          <p className="mt-2 text-xs text-warning-800">
            Below 25% there is evidence the agents <em>decide</em>, not that they decide well.
            Accuracy figures elsewhere on this page rest on this sample.
          </p>
        )}
      </Card>

      <p className="mt-3 text-xs text-slate-500">
        Same figures from the command line:{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5">npm run metrics:liquidity</code> · full
        register in{" "}
        <Link href="/admin/readiness" className="font-medium text-brand-700 underline">
          Readiness
        </Link>
      </p>
    </section>
  );
}
