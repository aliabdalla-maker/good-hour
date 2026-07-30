"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BookingRequestPublic } from "@gihtcx/shared";
import { api, ApiError } from "../../../lib/apiClient";

function defaultDateTime(hoursFromNow: number) {
  const d = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

import { RequireAuth } from "../../../components/RequireAuth";

export default function NewBookingRequestPage() {
  return (
    <RequireAuth>
      <NewBookingRequestPageInner />
    </RequireAuth>
  );
}

function NewBookingRequestPageInner() {
  const router = useRouter();
  const [locationQuery, setLocationQuery] = useState("London");
  const [desiredStart, setDesiredStart] = useState(defaultDateTime(2));
  const [desiredEnd, setDesiredEnd] = useState(defaultDateTime(8));
  const [requiredAmenities, setRequiredAmenities] = useState("wifi, parking");
  const [maxBudget, setMaxBudget] = useState("");
  const [autoAcceptEnabled, setAutoAcceptEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const bookingRequest = await api.post<BookingRequestPublic>("/bidding/requests", {
        category: "ROOM",
        locationQuery,
        desiredStart: new Date(desiredStart).toISOString(),
        desiredEnd: new Date(desiredEnd).toISOString(),
        requiredAmenities: requiredAmenities
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        maxBudget: maxBudget ? Number(maxBudget) : null,
        autoAcceptEnabled,
      });
      router.push(`/requests/${bookingRequest.id}/offers`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create request");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-display mb-2 text-2xl font-semibold">Ask suppliers to compete for your booking</h1>
      <p className="mb-6 text-sm text-slate-500">
        Post what you need; suppliers (and their auto-offer agents) submit competing offers, and our negotiation
        agent recommends the best match.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          Location
          <input
            value={locationQuery}
            onChange={(e) => setLocationQuery(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          From
          <input
            type="datetime-local"
            value={desiredStart}
            onChange={(e) => setDesiredStart(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Until
          <input
            type="datetime-local"
            value={desiredEnd}
            onChange={(e) => setDesiredEnd(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Required amenities (comma-separated)
          <input
            value={requiredAmenities}
            onChange={(e) => setRequiredAmenities(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Max budget (optional, total)
          <input
            type="number"
            value={maxBudget}
            onChange={(e) => setMaxBudget(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoAcceptEnabled} onChange={(e) => setAutoAcceptEnabled(e.target.checked)} />
          Let my agent auto-accept the AI-recommended offer if it&apos;s within budget (A2B)
        </label>
        {error && <p className="text-sm text-danger-600">{error}</p>}
        <button type="submit" disabled={submitting} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
          {submitting ? "Posting..." : "Post request"}
        </button>
      </form>
    </div>
  );
}
