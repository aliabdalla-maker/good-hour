"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ErpOverview } from "@gihtcx/shared";
import { ERP_ADMIN_EMAIL } from "@gihtcx/shared";
import { api } from "../../../lib/apiClient";
import { useCurrentUser } from "../../../lib/useCurrentUser";
import { RequireAuth } from "../../../components/RequireAuth";
import { Spinner } from "../../../components/ui/Spinner";

const PIPELINE_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Pending payment",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
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

  const { financial, bookingPipeline, supplierLedger, agentOps } = data;
  const fmt = (n: number) => `${financial.currency} ${n.toFixed(2)}`;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">ERP</h1>
      <p className="mb-6 text-sm text-slate-500">
        Owner-only financial and operations overview — not visible to any other account.
      </p>

      {/* Financial summary */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Gross booking value" value={fmt(financial.grossBookingValue)} gradient />
        <StatCard label="Platform fee revenue" value={fmt(financial.platformFeeRevenue)} />
        <StatCard label="Supplier payouts" value={fmt(financial.supplierPayoutsTotal)} />
        <StatCard label="Refunded" value={fmt(financial.refundedTotal)} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Booking pipeline */}
        <section>
          <h2 className="mb-3 text-lg font-semibold">Booking pipeline</h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(bookingPipeline).map(([status, count]) => (
                  <tr key={status} className="border-t border-slate-100">
                    <td className="px-3 py-2">{PIPELINE_LABELS[status] ?? status}</td>
                    <td className="px-3 py-2 text-right font-medium">{count}</td>
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
        <section>
          <h2 className="mb-3 text-lg font-semibold">Agent ops</h2>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
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
                  <tr key={a.agentType} className="border-t border-slate-100">
                    <td className="px-3 py-2">{a.agentType}</td>
                    <td className="px-3 py-2 text-right">{a.totalDecisions}</td>
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
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Supplier payout ledger</h2>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
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
                <tr key={s.supplierId} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">{s.email}</td>
                  <td className="px-3 py-2 text-slate-500">{s.verificationStatus.toLowerCase()}</td>
                  <td className="px-3 py-2 text-right">{s.propertyCount}</td>
                  <td className="px-3 py-2 text-right">{s.confirmedBookings}</td>
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

function StatCard({ label, value, gradient }: { label: string; value: string; gradient?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-4 shadow-card ${gradient ? "text-white" : "border border-slate-200 bg-white"}`}
      style={gradient ? { backgroundImage: "linear-gradient(135deg,#0d9488,#14b8a6 60%,#7c3aed)" } : undefined}
    >
      <p className={`text-xs uppercase tracking-wide ${gradient ? "text-white/80" : "text-slate-400"}`}>{label}</p>
      <p className={`mt-1 text-xl font-semibold ${gradient ? "" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
