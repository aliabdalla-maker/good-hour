"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ReceiptView } from "@gihtcx/shared";
import { api } from "../../../../lib/apiClient";

const CATEGORY_LABEL: Record<ReceiptView["category"], string> = {
  ROOM: "Room",
  CAR: "Car rental",
  TRAVEL_SERVICE: "Travel service",
};

import { RequireAuth } from "../../../../components/RequireAuth";
import { BUYER_FEE_LABEL } from "@gihtcx/shared";

export default function ReceiptPage() {
  return (
    <RequireAuth>
      <ReceiptPageInner />
    </RequireAuth>
  );
}

function ReceiptPageInner() {
  const { id } = useParams<{ id: string }>();
  const { data: r, error } = useQuery<ReceiptView>({
    queryKey: ["receipt", id],
    queryFn: () => api.get<ReceiptView>(`/bookings/${id}/receipt`),
  });

  if (error) return <p className="text-sm text-danger-600">Couldn&apos;t load this receipt.</p>;
  if (!r) return <p className="text-slate-500">Loading receipt…</p>;

  const money = (n: number) => `${r.currency} ${n.toFixed(2)}`;

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="font-display text-2xl font-semibold">Receipt</h1>
        <button
          onClick={() => window.print()}
          className="rounded bg-slate-900 px-4 py-2 text-sm text-white"
        >
          Print / Save as PDF
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <p className="text-lg font-semibold">Good Hours</p>
            <p className="text-xs text-slate-500">goodhour.shop</p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Receipt #{r.bookingId.slice(-8).toUpperCase()}</p>
            <p>{new Date(r.issuedAt).toLocaleDateString()}</p>
            <p className="mt-1 inline-block rounded bg-slate-100 px-2 py-0.5 uppercase tracking-wide">{r.status}</p>
          </div>
        </div>

        <div className="border-b border-slate-100 py-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">{CATEGORY_LABEL[r.category]}</p>
          <p className="font-medium">{r.itemName}</p>
          <p className="text-sm text-slate-500">{r.hostName} · {r.city}</p>
          <p className="mt-1 text-sm text-slate-500">
            {new Date(r.startsAt).toLocaleString()} → {new Date(r.endsAt).toLocaleString()} ({r.hours}h)
          </p>
        </div>

        <div className="py-4 text-sm">
          <Row label={`Subtotal (${r.hours}h)`} value={money(r.subtotal)} />
          <Row label={`Platform service fee (${BUYER_FEE_LABEL})`} value={money(r.travellerFee)} />
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
            <span>Total paid</span>
            <span>{money(r.total)}</span>
          </div>
        </div>

        <p className="border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
          Thank you for booking with Good Hours. This receipt is your proof of purchase.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 text-slate-600">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
