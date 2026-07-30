"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { SearchResult } from "@gihtcx/shared";
import { api } from "../../lib/apiClient";
import { humanizeTag } from "../../lib/humanize";
import { ListingImage } from "../../components/ui/ListingImage";
import { InteractiveCard } from "../../components/ui/Card";
import { SkeletonGrid } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";

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

  const { data: results, isFetching, error, refetch } = useQuery<SearchResult[]>({
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
      <h1 className="font-display mb-6 text-2xl font-semibold">Book instantly by city &amp; time</h1>
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

      {isFetching && <SkeletonGrid count={4} />}
      {error && !isFetching && (
        <EmptyState
          icon="⚠️"
          title="We couldn't complete that search"
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
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!isFetching &&
          results?.map((room, idx) => (
            <Link key={room.roomId} href={`/room/${room.roomId}`}>
              <InteractiveCard
                className="group h-full animate-fade-in-up overflow-hidden"
                style={{ animationDelay: `${Math.min(idx, 6) * 70}ms` }}
              >
                <div className="relative h-36 overflow-hidden">
                  <ListingImage
                    src={room.imageUrl}
                    alt={room.roomName}
                    seed={room.roomName}
                    className="transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent" />
                  <span className="absolute bottom-2 start-2 rounded-md bg-black/40 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
                    {room.city}
                  </span>
                  {room.imageIsAiGenerated && (
                    <span className="absolute end-2 top-2 rounded-md bg-ai-600/90 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
                      ✨ AI-generated photo
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <h2 className="font-display text-lg font-medium">{room.roomName}</h2>
                  <p className="text-sm text-slate-500">{room.propertyName}</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Capacity: {room.capacity} · {room.hours}h
                  </p>
                  {room.amenities.length > 0 && (
                    <p className="mt-1 text-sm text-slate-500">{room.amenities.map(humanizeTag).join(", ")}</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-baseline gap-2">
                    <span className="text-lg font-semibold">
                      {room.currency} {room.estimatedTotal.toFixed(2)}
                    </span>
                    {room.aiSuggestedHourlyRate !== null && (
                      <span className="rounded bg-ai-50 px-2 py-0.5 text-xs font-medium text-ai-700">
                        ✦ AI rate: {room.currency} {room.aiSuggestedHourlyRate.toFixed(2)}/hr
                      </span>
                    )}
                  </div>
                </div>
              </InteractiveCard>
            </Link>
          ))}
      </div>

      {results && results.length === 0 && !isFetching && !error && (
        <EmptyState
          title="Nothing available for those times"
          description="Try widening the time range, or search a different city."
        />
      )}
    </div>
  );
}
