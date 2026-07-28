"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ErpOverview } from "@gihtcx/shared";
import { ERP_ADMIN_EMAIL } from "@gihtcx/shared";
import { api } from "../../../lib/apiClient";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { RequireAuth } from "../../../components/RequireAuth";
import { Spinner } from "../../../components/ui/Spinner";
import { AnimatedNumber } from "../../../components/ui/AnimatedNumber";
import { AiBadge } from "../../../components/ai/AiBadge";

const PIPELINE_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Pending payment",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

const BID_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  MATCHED: "Matched",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

const CRM_STAGE_LABELS: Record<string, string> = {
  LEAD: "Lead",
  ACTIVE: "Active",
  VIP: "VIP",
  DORMANT: "Dormant",
};

export default function ErpPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <ErpGate />
    </RequireAuth>
  );
}

// RequireAuth only checks the ADMIN role; this console is further
// restricted to one specific owner-operator account. The api enforces this
// for real (requireEmail) -- this is just so other admins land somewhere
// sensible instead of a bare 403 from a failed query.
function ErpGate() {
  const { data: user, isLoading } = useCurrentUser();
  const router = useRouter();
  const isOwner = user?.email === ERP_ADMIN_EMAIL;

  useEffect(() => {
    if (!isLoading && user && !isOwner) router.replace("/browse");
  }, [isLoading, user, isOwner, router]);

  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Spinner /> <span className="ml-2 text-sm">Loading…</span>
      </div>
    );
  }
  if (!isOwner) {
    return <div className="py-24 text-center text-sm text-slate-500">Redirecting…</div>;
  }
  return <ErpInner />;
}

function ErpInner() {
  const { data, isPending, error } = useQuery<ErpOverview>({
    queryKey: ["erp-overview"],
    queryFn: () => api.get<ErpOverview>("/erp/overview"),
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Spinner /> <span className="ml-2 text-sm">Loading…</span>
      </div>
    );
  }
  if (error || !data) {
    return <p className="py-24 text-center text-sm text-red-600">Couldn&apos;t load the ERP overview.</p>;
  }

  const { financial, bookingPipeline, supplierLedger, agentOps, crm, bidding, creditEconomy, aiInsights } = data;
  const fmt = (n: number) => `${financial.currency} ${n.toFixed(2)}`;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">ERP</h1>
      <p className="mb-6 text-sm text-slate-500">
        Owner-only financial and operations overview — not visible to any other account.
      </p>

      {/* Agentic AI insights */}
      <section className="mb-8 animate-fade-in-up rounded-2xl border border-ai-200 bg-gradient-to-br from-ai-50 via-white to-brand-50 bg-[length:200%_200%] p-5 shadow-card animate-gradient-pan">
        <div className="mb-2 flex items-center justify-between">
          <AiBadge label="AI ops analyst" />
          <span className="text-xs text-ai-600">{aiInsights.generatedBy}</span>
        </div>
        <p className="text-sm font-medium text-slate-800">{aiInsights.summary}</p>
        {aiInsights.recommendations.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {aiInsights.recommendations.map((r, i) => (
              <li
                key={i}
                className="animate-fade-in-up flex items-start gap-2 text-sm text-slate-700"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="mt-0.5 text-ai-600" aria-hidden="true">→</span>
                {r}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Financial summary */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Gross booking value" value={financial.grossBookingValue} fmt={fmt} delay={0} gradient />
        <StatCard label="Platform fee revenue" value={financial.platformFeeRevenue} fmt={fmt} delay={60} />
        <StatCard label="Supplier payouts" value={financial.supplierPayoutsTotal} fmt={fmt} delay={120} />
        <StatCard label="Refunded" value={financial.refundedTotal} fmt={fmt} delay={180} />
      </div>

      {/* Time-credit economy */}
      <section
        className="mb-8 animate-fade-in-up rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover"
        style={{ animationDelay: "180ms" }}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Time-credit economy</h2>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
            Outstanding hours are a liability, not revenue
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-slate-400">Hours outstanding</p>
            <p className="text-xl font-semibold text-slate-900">
              <AnimatedNumber value={creditEconomy.outstandingHours} decimals={2} />
            </p>
          </div>
          <div>
            <p className="text-slate-400">Liability value</p>
            <p className="text-xl font-semibold text-amber-700">{fmt(creditEconomy.outstandingValue)}</p>
          </div>
          <div>
            <p className="text-slate-400">Credits sold</p>
            <p className="text-xl font-semibold text-slate-900">{fmt(creditEconomy.creditsSoldValue)}</p>
          </div>
          <div>
            <p className="text-slate-400">Credit fee revenue</p>
            <p className="text-xl font-semibold text-brand-700">{fmt(creditEconomy.creditFeeRevenue)}</p>
          </div>
        </div>
      </section>

      {/* CRM + bidding integration */}
      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="animate-fade-in-up rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">CRM contacts</h2>
            <Link href="/admin/crm" className="text-xs font-medium text-brand-700 hover:underline">
              Open CRM →
            </Link>
          </div>
          <p className="mb-3 text-2xl font-semibold text-slate-900">
            <AnimatedNumber value={crm.total} /> <span className="text-sm font-normal text-slate-400">contacts</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(crm.byStage).map(([stage, count]) => (
              <span key={stage} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {CRM_STAGE_LABELS[stage] ?? stage}: <AnimatedNumber value={count} />
              </span>
            ))}
          </div>
        </section>

        <section className="animate-fade-in-up rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition-shadow hover:shadow-card-hover" style={{ animationDelay: "60ms" }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Bidding pipeline</h2>
            <Link href="/requests/new" className="text-xs font-medium text-brand-700 hover:underline">
              New request →
            </Link>
          </div>
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-slate-400">Offers submitted</p>
              <p className="font-semibold text-slate-900"><AnimatedNumber value={bidding.totalOffers} /></p>
            </div>
            <div>
              <p className="text-slate-400">Agent-submitted</p>
              <p className="font-semibold text-slate-900"><AnimatedNumber value={bidding.agentSubmittedOffers} /></p>
            </div>
            <div>
              <p className="text-slate-400">Avg offers / request</p>
              <p className="font-semibold text-slate-900"><AnimatedNumber value={bidding.avgOffersPerRequest} decimals={2} /></p>
            </div>
            <div>
              <p className="text-slate-400">Match rate</p>
              <p className="font-semibold text-slate-900"><AnimatedNumber value={bidding.matchRate * 100} decimals={0} />%</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(bidding.requestsByStatus).map(([status, count]) => (
              <span key={status} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {BID_STATUS_LABELS[status] ?? status}: <AnimatedNumber value={count} />
              </span>
            ))}
            {Object.keys(bidding.requestsByStatus).length === 0 && (
              <span className="text-xs text-slate-400">No booking requests yet.</span>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Booking pipeline */}
        <section className="animate-fade-in-up">
          <h2 className="mb-3 text-lg font-semibold">Booking pipeline</h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card transition-shadow hover:shadow-card-hover">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(bookingPipeline).map(([status, count]) => (
                  <tr key={status} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                    <td className="px-3 py-2">{PIPELINE_LABELS[status] ?? status}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      <AnimatedNumber value={count} />
                    </td>
                  </tr>
                ))}
                {Object.keys(bookingPipeline).length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-3 py-6 text-center text-slate-400">
                      No bookings yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Agent ops */}
        <section className="animate-fade-in-up" style={{ animationDelay: "60ms" }}>
          <h2 className="mb-3 text-lg font-semibold">Agent ops</h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card transition-shadow hover:shadow-card-hover">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2 text-right">Decisions</th>
                  <th className="px-3 py-2 text-right">Accepted</th>
                  <th className="px-3 py-2 text-right">Avg latency</th>
                </tr>
              </thead>
              <tbody>
                {agentOps.map((a) => (
                  <tr key={a.agentType} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <AiBadge label={a.agentType} className="bg-ai-50" />
                    </td>
                    <td className="px-3 py-2 text-right"><AnimatedNumber value={a.totalDecisions} /></td>
                    <td className="px-3 py-2 text-right">
                      {a.accepted + a.rejected > 0 ? `${a.accepted}/${a.accepted + a.rejected}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{a.avgLatencyMs}ms</td>
                  </tr>
                ))}
                {agentOps.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                      No agent decisions logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Supplier payout ledger */}
      <section className="mt-8 animate-fade-in-up" style={{ animationDelay: "120ms" }}>
        <h2 className="mb-3 text-lg font-semibold">Supplier payout ledger</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card transition-shadow hover:shadow-card-hover">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2">Verification</th>
                <th className="px-3 py-2 text-right">Listings</th>
                <th className="px-3 py-2 text-right">Confirmed bookings</th>
                <th className="px-3 py-2 text-right">Total payout</th>
              </tr>
            </thead>
            <tbody>
              {supplierLedger.map((s) => (
                <tr key={s.supplierId} className="border-t border-slate-100 transition-colors hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">{s.email}</td>
                  <td className="px-3 py-2 text-slate-500">{s.verificationStatus.toLowerCase()}</td>
                  <td className="px-3 py-2 text-right"><AnimatedNumber value={s.propertyCount} /></td>
                  <td className="px-3 py-2 text-right"><AnimatedNumber value={s.confirmedBookings} /></td>
                  <td className="px-3 py-2 text-right font-medium">{fmt(s.totalPayout)}</td>
                </tr>
              ))}
              {supplierLedger.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                    No suppliers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-6 text-xs text-slate-400">Generated {new Date(data.generatedAt).toLocaleString()}</p>
    </div>
  );
}

function StatCard({
  label,
  value,
  fmt,
  gradient,
  delay = 0,
}: {
  label: string;
  value: number;
  fmt: (n: number) => string;
  gradient?: boolean;
  delay?: number;
}) {
  return (
    <div
      className={`animate-fade-in-up rounded-2xl p-4 shadow-card transition-transform hover:-translate-y-0.5 hover:shadow-card-hover ${gradient ? "text-white" : "border border-slate-200 bg-white"}`}
      style={{
        animationDelay: `${delay}ms`,
        ...(gradient ? { backgroundImage: "linear-gradient(135deg,#0d9488,#14b8a6 60%,#7c3aed)" } : {}),
      }}
    >
      <p className={`text-xs uppercase tracking-wide ${gradient ? "text-white/80" : "text-slate-400"}`}>{label}</p>
      <p className={`mt-1 text-xl font-semibold ${gradient ? "" : "text-slate-900"}`}>
        {financialPrefix(fmt)}
        <AnimatedNumber value={value} decimals={2} />
      </p>
    </div>
  );
}

/** Extracts just the currency-code prefix from the `fmt` closure (e.g. "GBP ") so AnimatedNumber can own the numeric part. */
function financialPrefix(fmt: (n: number) => string): string {
  return fmt(0).replace(/[\d.,]+$/, "");
}
