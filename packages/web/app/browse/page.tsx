"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { PropertyWithRooms, ListingCategory } from "@gihtcx/shared";
import { BUYER_FEE_RATE, SELLER_FEE_RATE } from "@gihtcx/shared";
import { api } from "../../lib/apiClient";
import { Card, InteractiveCard } from "../../components/ui/Card";
import { Badge } from "../../components/ui/Badge";
import { Stars } from "../../components/ui/Stars";
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

// Deterministic gradient thumbnail until real listing photos land.
const GRADIENTS = [
  "from-brand-400 to-brand-600",
  "from-ai-400 to-ai-600",
  "from-amber-300 to-amber-500",
  "from-sky-400 to-sky-600",
];
function thumb(seed: string) {
  const i = seed.charCodeAt(0) % GRADIENTS.length;
  return GRADIENTS[i];
}

export default function BrowsePage() {
  const [filter, setFilter] = useState<"ALL" | ListingCategory>("ALL");
  const { data: properties, isPending, error } = useQuery<PropertyWithRooms[]>({
    queryKey: ["catalog"],
    queryFn: () => api.get<PropertyWithRooms[]>("/listings/catalog"),
  });

  const visible = properties?.filter((p) => filter === "ALL" || p.category === filter);

  return (
    <div>
      <section className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Rooms, cars &amp; travel by the hour</h1>
        <p className="mt-1 text-slate-500">Browse everything on Good Hours, or choose how you want to book.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link href="/search">
            <InteractiveCard className="h-full p-4">
              <h2 className="font-medium">⚡ Book instantly</h2>
              <p className="mt-1 text-sm text-slate-500">Search by city and time and pay right away for a guaranteed slot.</p>
            </InteractiveCard>
          </Link>
          <Link href="/requests/new">
            <InteractiveCard className="h-full p-4">
              <h2 className="flex items-center gap-2 font-medium">✦ Request a match <Badge tone="ai">AI reverse auction</Badge></h2>
              <p className="mt-1 text-sm text-slate-500">Post what you need and let suppliers — and their AI agents — bid for your booking.</p>
            </InteractiveCard>
          </Link>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          A {(BUYER_FEE_RATE * 100).toFixed(0)}% platform fee is charged to the traveller and a {(SELLER_FEE_RATE * 100).toFixed(0)}% fee to the host on every booking.
        </p>
      </section>

      {/* Category filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                active
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {isPending && <SkeletonGrid count={4} />}
      {error && <EmptyState icon="⚠️" title="Couldn't load listings" description="Is the API running?" />}

      <div className="grid grid-cols-1 gap-6">
        {visible?.map((property) => {
          const meta = CATEGORY_META[property.category];
          return (
            <Card key={property.id} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">{property.city}, {property.country}</p>
                  <h2 className="text-lg font-semibold">{property.name}</h2>
                  <p className="text-sm text-slate-500">{property.addressLine}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{meta.icon} {meta.label}</Badge>
                  <Badge tone="success">✓ Verified</Badge>
                  <span className="text-sm font-semibold text-slate-700">{rateRange(property)}</span>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {property.rooms.map((room) => (
                  <Link key={room.id} href={`/room/${room.id}`}>
                    <InteractiveCard className="overflow-hidden">
                      <div className={`flex h-24 items-end bg-gradient-to-br ${thumb(room.name)} p-3`}>
                        <span className="rounded-md bg-black/20 px-2 py-0.5 text-xs font-medium text-white">
                          {room.currency} {room.baseHourlyRate.toFixed(2)}{meta.unit}
                        </span>
                      </div>
                      <div className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="font-medium">{room.name}</h3>
                          <Stars rating={room.avgRating} count={room.reviewCount} showEmpty={false} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Capacity {room.capacity} · {room.minHours}-{room.maxHours}h</p>
                        {room.amenities.length > 0 && (
                          <p className="mt-1 text-xs text-slate-400">{room.amenities.join(", ")}</p>
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
          <EmptyState title="Nothing in this category yet" description="Try another category — hosts are adding listings." />
        )}
      </div>
    </div>
  );
}
