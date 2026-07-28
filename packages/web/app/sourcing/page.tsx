"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SourcedDraftPublic } from "@gihtcx/shared";
import { api, ApiError } from "../../lib/apiClient";

function PublishForm({ draft, onDone }: { draft: SourcedDraftPublic; onDone: () => void }) {
  const [name, setName] = useState(draft.name);
  const [addressLine, setAddressLine] = useState(draft.addressLine ?? "");
  const [city, setCity] = useState(draft.city ?? "");
  const [country, setCountry] = useState(draft.country ?? "");
  const [amenities, setAmenities] = useState(draft.amenities.join(", "));
  const [rate, setRate] = useState(String(draft.suggestedHourlyRate ?? 20));
  const [capacity, setCapacity] = useState("2");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function publish() {
    setError(null);
    setBusy(true);
    try {
      await api.post(`/sourcing/drafts/${draft.id}/publish`, {
        name,
        addressLine,
        city,
        country,
        amenities: amenities.split(",").map((a) => a.trim()).filter(Boolean),
        roomName: "Hourly Room",
        capacity: Number(capacity),
        baseHourlyRate: Number(rate),
        currency: draft.currency,
        minHours: 2,
        maxHours: 12,
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm">
      <label className="flex flex-col gap-1">Name<input value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-slate-300 px-2 py-1" /></label>
      <label className="flex flex-col gap-1">Address<input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} className="rounded border border-slate-300 px-2 py-1" /></label>
      <label className="flex flex-col gap-1">City<input value={city} onChange={(e) => setCity(e.target.value)} className="rounded border border-slate-300 px-2 py-1" /></label>
      <label className="flex flex-col gap-1">Country<input value={country} onChange={(e) => setCountry(e.target.value)} className="rounded border border-slate-300 px-2 py-1" /></label>
      <label className="flex flex-col gap-1">Amenities (comma)<input value={amenities} onChange={(e) => setAmenities(e.target.value)} className="rounded border border-slate-300 px-2 py-1" /></label>
      <label className="flex flex-col gap-1">Hourly rate<input value={rate} onChange={(e) => setRate(e.target.value)} className="rounded border border-slate-300 px-2 py-1" /></label>
      <label className="flex flex-col gap-1">Capacity<input value={capacity} onChange={(e) => setCapacity(e.target.value)} className="rounded border border-slate-300 px-2 py-1" /></label>
      {error && <p className="col-span-2 text-red-600">{error}</p>}
      <div className="col-span-2">
        <button onClick={publish} disabled={busy} className="rounded bg-emerald-600 px-3 py-1 text-white disabled:opacity-50">
          {busy ? "Publishing…" : "Publish as bookable listing"}
        </button>
      </div>
    </div>
  );
}

import { RequireAuth } from "../../components/RequireAuth";

export default function SourcingPage() {
  return (
    <RequireAuth roles={["SUPPLIER", "ADMIN"]}>
      <SourcingPageInner />
    </RequireAuth>
  );
}

function SourcingPageInner() {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const [feed, setFeed] = useState('[\n  { "name": "City Centre Meeting Room", "city": "London", "country": "UK", "amenities": ["wifi","projector"], "hourlyRate": 25 }\n]');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [smoobuBusy, setSmoobuBusy] = useState(false);

  const { data: drafts } = useQuery<SourcedDraftPublic[]>({
    queryKey: ["sourcing-drafts"],
    queryFn: () => api.get<SourcedDraftPublic[]>("/sourcing/drafts"),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["sourcing-drafts"] });
    queryClient.invalidateQueries({ queryKey: ["catalog"] });
  }

  async function importUrl() {
    setError(null);
    setNote(null);
    try {
      await api.post("/sourcing/import-url", { url });
      setUrl("");
      setNote("Imported as a draft below — review and publish when ready.");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Import failed");
    }
  }

  async function importFeed() {
    setError(null);
    setNote(null);
    try {
      const items = JSON.parse(feed);
      const res = await api.post<{ created: number }>("/sourcing/import-feed", { items });
      setNote(`Imported ${res.created} draft(s) from feed.`);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid JSON or import failed");
    }
  }

  async function importSmoobu() {
    setError(null);
    setNote(null);
    setSmoobuBusy(true);
    try {
      const res = await api.post<{ created: number }>("/sourcing/import-smoobu");
      setNote(
        res.created > 0
          ? `Imported ${res.created} new draft(s) from Smoobu.`
          : "No new Smoobu properties to import — everything's already been pulled in."
      );
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Smoobu import failed");
    } finally {
      setSmoobuBusy(false);
    }
  }

  async function discard(id: string) {
    await api.post(`/sourcing/drafts/${id}/discard`);
    refresh();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-2xl font-semibold">Import & source listings</h1>
      <p className="mb-6 text-sm text-slate-500">
        Bring in listings from your own website or a partner feed. Everything imported lands as a{" "}
        <strong>draft</strong> that you review and publish — nothing goes live automatically.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-medium">Import from a URL</h2>
          <p className="mb-2 text-xs text-slate-500">Paste a link to your own listing page. We&apos;ll parse what we can.</p>
          <div className="flex gap-2">
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" />
            <button onClick={importUrl} disabled={!url} className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50">Import</button>
          </div>
        </section>

        <section className="rounded border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-medium">Bulk import from a feed</h2>
          <p className="mb-2 text-xs text-slate-500">Paste a JSON array of listings (partner feed / CSV export).</p>
          <textarea value={feed} onChange={(e) => setFeed(e.target.value)} rows={4} className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs" />
          <button onClick={importFeed} className="mt-2 rounded bg-slate-900 px-3 py-1 text-sm text-white">Import feed</button>
        </section>

        <section className="rounded border border-slate-200 bg-white p-4 sm:col-span-2">
          <h2 className="mb-2 font-medium">Import from Smoobu</h2>
          <p className="mb-2 text-xs text-slate-500">
            Pulls in every property from the connected Smoobu account. Rates are per-stay in Smoobu, not hourly —
            review and set the real hourly rate before publishing.
          </p>
          <button onClick={importSmoobu} disabled={smoobuBusy} className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50">
            {smoobuBusy ? "Importing…" : "Import from Smoobu"}
          </button>
        </section>
      </div>

      {note && <p className="mt-3 text-sm text-emerald-600">{note}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <h2 className="mb-2 mt-8 text-lg font-medium">Draft listings ({drafts?.length ?? 0})</h2>
      <div className="flex flex-col gap-3">
        {drafts?.map((d) => (
          <div key={d.id} className="rounded border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{d.name}</p>
                <p className="text-xs text-slate-500">
                  {d.origin === "URL" ? d.sourceUrl : d.origin === "SMOOBU" ? "Smoobu" : d.origin === "FEED" ? "Feed import" : "Manual"} ·{" "}
                  {d.suggestedHourlyRate ? `${d.currency} ${d.suggestedHourlyRate.toFixed(2)}/hr` : "no rate parsed"}
                </p>
              </div>
              <div className="flex gap-2 text-sm">
                <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} className="rounded border border-slate-300 px-3 py-1 hover:border-slate-500">
                  {expanded === d.id ? "Cancel" : "Review & publish"}
                </button>
                <button onClick={() => discard(d.id)} className="rounded px-3 py-1 text-slate-500 hover:text-red-600">Discard</button>
              </div>
            </div>
            {expanded === d.id && <PublishForm draft={d} onDone={() => { setExpanded(null); refresh(); }} />}
          </div>
        ))}
        {drafts && drafts.length === 0 && <p className="text-slate-500">No drafts yet. Import from a URL or feed above.</p>}
      </div>
    </div>
  );
}
