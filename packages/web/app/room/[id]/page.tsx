"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { RoomPublic, PricingDecision, BookingPublic } from "@gihtcx/shared";
import { api, ApiError } from "../../../lib/apiClient";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Field, Input } from "../../../components/ui/Field";
import { Badge } from "../../../components/ui/Badge";
import { Spinner } from "../../../components/ui/Spinner";
import { Skeleton } from "../../../components/ui/Skeleton";
import { AiPriceCard } from "../../../components/ai/AiPriceCard";

function defaultDateTime(hoursFromNow: number) {
  const d = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export default function RoomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: room } = useQuery<RoomPublic>({
    queryKey: ["room", id],
    queryFn: () => api.get<RoomPublic>(`/listings/rooms/${id}`),
  });
  const { data: aiPrice } = useQuery<PricingDecision>({
    queryKey: ["room-ai-price", id],
    queryFn: () => api.get<PricingDecision>(`/pricing/rooms/${id}/suggested-rate`),
  });

  const [startsAt, setStartsAt] = useState(defaultDateTime(2));
  const [endsAt, setEndsAt] = useState(defaultDateTime(6));
  const [useAiSuggestedRate, setUseAiSuggestedRate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const booking = await api.post<BookingPublic>("/bookings", {
        roomId: id,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        useAiSuggestedRate,
      });
      if (booking.clientSecret) sessionStorage.setItem(`clientSecret:${booking.id}`, booking.clientSecret);
      router.push(`/booking/${booking.id}/checkout`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Booking failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!room) {
    return (
      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      {/* Hero placeholder (real photos land in the imagery batch). */}
      <div className="mb-6 flex h-40 items-end rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-5 sm:h-52">
        <div className="text-white">
          {room.property && (
            <p className="text-xs uppercase tracking-wide text-white/80">
              {room.property.city}, {room.property.country}
            </p>
          )}
          <h1 className="text-2xl font-semibold">{room.name}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">Capacity {room.capacity}</Badge>
            <Badge>{room.minHours}–{room.maxHours}h bookings</Badge>
            {room.amenities.map((a) => (
              <Badge key={a}>{a}</Badge>
            ))}
          </div>

          <div>
            <p className="text-xs uppercase text-slate-400">Host rate</p>
            <p className="text-xl font-semibold text-slate-900">
              {room.currency} {room.baseHourlyRate.toFixed(2)}<span className="text-sm font-normal text-slate-500">/hr</span>
            </p>
          </div>

          {aiPrice && <AiPriceCard currency={room.currency} baseRate={room.baseHourlyRate} decision={aiPrice} />}

          {room.property && (
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{room.property.name}</p>
                <Badge tone="success">✓ Verified host</Badge>
              </div>
              <p className="text-sm text-slate-500">{room.property.addressLine}</p>
              {room.property.amenities.length > 0 && (
                <p className="mt-1 text-xs text-slate-400">Property: {room.property.amenities.join(", ")}</p>
              )}
              <p className="mt-2 text-xs text-slate-400">Free cancellation while the booking is unpaid.</p>
            </Card>
          )}
        </div>

        <Card className="h-fit p-5">
          <h2 className="mb-4 text-lg font-semibold">Book this room</h2>
          <form onSubmit={handleBook} className="flex flex-col gap-4">
            <Field label="From">
              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </Field>
            <Field label="Until">
              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </Field>
            {aiPrice && (
              <label className="flex items-center gap-2 rounded-lg bg-ai-50 p-2 text-sm text-ai-800">
                <input type="checkbox" checked={useAiSuggestedRate} onChange={(e) => setUseAiSuggestedRate(e.target.checked)} />
                Use the AI-optimised rate instead of the host rate
              </label>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <p className="text-xs text-slate-400">
              A 1% platform service fee is added at checkout. The host is charged a matching 1%.
            </p>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner />}
              {submitting ? "Booking…" : "Book & continue to payment"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
