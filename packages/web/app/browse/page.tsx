"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { PropertyWithRooms, ListingCategory } from "@gihtcx/shared";
import { api } from "../../lib/apiClient";
import { humanizeTag } from "../../lib/humanize";
import { Card, InteractiveCard } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Stars } from "../../components/ui/Stars";
import { ListingImage } from "../../components/ui/ListingImage";
import { SkeletonGrid } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";

const CATEGORY_META: Record<ListingCategory, { label: string; icon: string; unit: string }> = {
  ROOM: { label: "Room", icon: "🏨", unit: "/hr" },
  CAR: { label: "Car", icon: "🚗", unit: "/hr" },
  TRAVEL_SERVICE: { label: "Travel service", icon: "🧭", unit: "/hr" },
};

const FILTERS: { key: "ALL" | ListingCategory; label: string }[] = [
  { key: "ALL", label: "Everything" },
  { key: "ROOM", label: "🏨 Rooms" },
  { key: "CAR", label: "🚗 Cars" },
  { key: "TRAVEL_SERVICE", label: "🧭 Travel services" },
];

function rateRange(property: PropertyWithRooms) {
  const rates = property.rooms.map((r) => r.baseHourlyRate);
  const currency = property.rooms[0]?.currency ?? "GBP";
  const unit = CATEGORY_META[property.category].unit;
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  return min === max
    ? `${currency} ${min.toFixed(2)}${unit}`
    : `${currency} ${min.toFixed(2)}–${max.toFixed(2)}${unit}`;
}

export default function BrowsePage() {
  const [filter, setFilter] = useState<"ALL" | ListingCategory>("ALL");
  const { data: properties, isPending, error, refetch } = useQuery<PropertyWithRooms[]>({
    queryKey: ["catalog"],
    queryFn: () => api.get<PropertyWithRooms[]>("/listings/catalog"),
  });

  const visible = properties?.filter((p) => filter === "ALL" || p.category === filter);

  return (
    <div>
      <section className="mb-8 animate-fade-in-up">
        <div
          className="relative overflow-hidden rounded-2xl p-8 text-white shadow-card sm:p-10"
          style={{
            backgroundImage:
              "linear-gradient(120deg, #00665e 0%, #004c46 40%, #632bc0 100%)",
            backgroundSize: "200% 200%",
          }}
        >
          <div className="pointer-events-none absolute -end-16 -top-16 h-56 w-56 animate-float rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-20 start-10 h-48 w-48 animate-float rounded-full bg-white/10 blur-2xl" style={{ animationDelay: "2s" }} />
          <div className="relative max-w-2xl">
            <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
              Rooms · Cars · Travel by the hour
            </span>
            <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Book the good hours. Skip the rest.
            </h1>
            <p className="mt-2 max-w-lg text-white/85">
              Hourly stays, cars and experiences from verified hosts. Pay instantly, or let AI agents
              compete for your booking.
            </p>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Link
                href="/search"
                className="group rounded-xl bg-white/95 p-4 text-slate-900 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-card-hover"
              >
                <h2 className="font-display font-semibold">⚡ Book instantly</h2>
                <p className="mt-1 text-sm text-slate-500">Search by city &amp; time, pay now, get a guaranteed slot.</p>
              </Link>
              <Link
                href="/requests/new"
                className="group rounded-xl bg-white/10 p-4 text-white ring-1 ring-white/25 backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/15"
              >
                <span className="inline-block rounded-full bg-ai-600 px-2 py-0.5 text-xs font-medium">AI reverse auction</span>
                <h2 className="font-display mt-1.5 font-semibold">✦ Request a match</h2>
                <p className="mt-1 text-sm text-white/80">Post what you need and hosts &amp; their agents bid for you.</p>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Category filter */}
      <div className="-mx-6 mb-6 flex gap-2 overflow-x-auto px-6 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                active
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {isPending && <SkeletonGrid count={4} />}
      {error && (
        <EmptyState
          icon="⚠️"
          title="We couldn't load listings"
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

      <div className="grid grid-cols-1 gap-6">
        {visible?.map((property, idx) => {
          const meta = CATEGORY_META[property.category];
          return (
            <Card
              key={property.id}
              className="animate-fade-in-up p-4"
              style={{ animationDelay: `${Math.min(idx, 6) * 70}ms` }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{property.city}, {property.country}</p>
                  <h2 className="font-display text-lg font-semibold">{property.name}</h2>
                  <p className="text-sm text-slate-500">{property.addressLine}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{meta.icon} {meta.label}</Badge>
                  {property.hostVerified && <Badge tone="success">✓ Verified</Badge>}
                  <span className="text-sm font-semibold text-slate-700">{rateRange(property)}</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {property.rooms.map((room) => (
                  <Link key={room.id} href={`/room/${room.id}`}>
                    <InteractiveCard className="group overflow-hidden">
                      <div className="relative h-32 overflow-hidden">
                        <ListingImage
                          src={room.imageUrl}
                          alt={room.name}
                          seed={room.name}
                          className="transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent" />
                        <span className="absolute bottom-2 start-2 rounded-md bg-black/40 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
                          {room.currency} {room.baseHourlyRate.toFixed(2)}{meta.unit}
                        </span>
                        {room.imageIsAiGenerated && (
                          <span className="absolute end-2 top-2 rounded-md bg-ai-600/90 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
                            ✨ AI-generated photo
                          </span>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-medium">{room.name}</h3>
                          <Stars rating={room.avgRating} count={room.reviewCount} showEmpty={false} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Capacity {room.capacity} · {room.minHours}-{room.maxHours}h</p>
                        {room.amenities.length > 0 && (
                          <p className="mt-1 text-xs text-slate-500">{room.amenities.map(humanizeTag).join(", ")}</p>
                        )}
                      </div>
                    </InteractiveCard>
                  </Link>
                ))}
              </div>
            </Card>
          );
        })}
        {visible && visible.length === 0 && (
          <EmptyState title="Nothing in this category yet" description="Try another category. Hosts are adding listings." />
        )}
      </div>
    </div>
  );
}
