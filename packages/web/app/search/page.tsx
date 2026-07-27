"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { SearchResult } from "@gihtcx/shared";
import { api } from "../../lib/apiClient";
import { humanizeTag } from "../../lib/humanize";

function defaultDateTime(hoursFromNow: number) {
  const d = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export default function SearchPage() {
  const [city, setCity] = useState("London");
  const [startsAt, setStartsAt] = useState(defaultDateTime(2));
  const [endsAt, setEndsAt] = useState(defaultDateTime(6));
  const [includeAiPrice, setIncludeAiPrice] = useState(true);
  const [submittedQuery, setSubmittedQuery] = useState({ city, startsAt, endsAt, includeAiPrice });

  const { data: results, isFetching, error } = useQuery<SearchResult[]>({
    queryKey: ["search", submittedQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        city: submittedQuery.city,
        startsAt: new Date(submittedQuery.startsAt).toISOString(),
        endsAt: new Date(submittedQuery.endsAt).toISOString(),
        includeAiPrice: String(submittedQuery.includeAiPrice),
      });
      return api.get<SearchResult[]>(`/search?${params.toString()}`);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmittedQuery({ city, startsAt, endsAt, includeAiPrice });
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Book instantly by city &amp; time</h1>
      <form onSubmit={handleSubmit} className="mb-8 grid grid-cols-1 gap-4 rounded border border-slate-200 bg-white p-4 sm:grid-cols-5">
        <label className="flex flex-col gap-1 text-sm">
          City
          <input value={city} onChange={(e) => setCity(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          From
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Until
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" checked={includeAiPrice} onChange={(e) => setIncludeAiPrice(e.target.checked)} />
          Show AI price
        </label>
        <button type="submit" className="self-end rounded bg-slate-900 px-4 py-2 text-white">
          Search
        </button>
      </form>

      {isFetching && <p className="text-slate-500">Searching...</p>}
      {error && <p className="text-red-600">Failed to search. Is the API running?</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {results?.map((room) => (
          <Link
            key={room.roomId}
            href={`/room/${room.roomId}`}
            className="rounded border border-slate-200 bg-white p-4 hover:border-slate-400"
          >
            <p className="text-xs uppercase tracking-wide text-slate-400">{room.city}</p>
            <h2 className="text-lg font-medium">{room.roomName}</h2>
            <p className="text-sm text-slate-500">{room.propertyName}</p>
            <p className="mt-2 text-sm">Capacity: {room.capacity} · {room.hours}h</p>
            <p className="mt-1 text-sm text-slate-500">{room.amenities.map(humanizeTag).join(", ")}</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-lg font-semibold">
                {room.currency} {room.estimatedTotal.toFixed(2)}
              </span>
              {room.aiSuggestedHourlyRate !== null && (
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
                  AI rate: {room.currency} {room.aiSuggestedHourlyRate.toFixed(2)}/hr
                </span>
              )}
            </div>
          </Link>
        ))}
        {results && results.length === 0 && !isFetching && (
          <p className="text-slate-500">Nothing available for that search. Try widening the time range.</p>
        )}
      </div>
    </div>
  );
}
