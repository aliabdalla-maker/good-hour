"use client";

import { Suspense, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { RoomPublic, PricingDecision, BookingPublic, ReviewPublic, CreditWallet } from "@gihtcx/shared";
import { api, ApiError } from "../../../lib/apiClient";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Field, Input } from "../../../components/ui/Field";
import { Badge } from "../../../components/ui/Badge";
import { Stars } from "../../../components/ui/Stars";
import { ListingImage } from "../../../components/ui/ListingImage";
import { Spinner } from "../../../components/ui/Spinner";
import { Skeleton } from "../../../components/ui/Skeleton";
import { AiPriceCard } from "../../../components/ai/AiPriceCard";
import { humanizeTag } from "../../../lib/humanize";

function defaultDateTime(hoursFromNow: number) {
  const d = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

// Matches defaultDateTime's convention above (toISOString, not local time).
function toDatetimeLocalValue(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 16);
}

// useSearchParams() requires a Suspense boundary for static prerendering.
export default function RoomDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      }
    >
      <RoomDetail />
    </Suspense>
  );
}

function RoomDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: room } = useQuery<RoomPublic>({
    queryKey: ["room", id],
    queryFn: () => api.get<RoomPublic>(`/listings/rooms/${id}`),
  });
  const { data: aiPrice } = useQuery<PricingDecision>({
    queryKey: ["room-ai-price", id],
    queryFn: () => api.get<PricingDecision>(`/pricing/rooms/${id}/suggested-rate`),
  });
  const { data: reviews } = useQuery<ReviewPublic[]>({
    queryKey: ["room-reviews", id],
    queryFn: () => api.get<ReviewPublic[]>(`/reviews?roomId=${id}`),
  });

  // Pre-filled when the assistant's "propose_booking" action linked here —
  // still just form defaults; the traveller must still submit to book.
  const prefilledStart = toDatetimeLocalValue(searchParams.get("startsAt") ?? "");
  const prefilledEnd = toDatetimeLocalValue(searchParams.get("endsAt") ?? "");
  const [startsAt, setStartsAt] = useState(prefilledStart ?? defaultDateTime(2));
  const [endsAt, setEndsAt] = useState(prefilledEnd ?? defaultDateTime(6));
  const [useAiSuggestedRate, setUseAiSuggestedRate] = useState(false);
  const [redeemCreditHours, setRedeemCreditHours] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Only signed-in users have a wallet; a 401 here is expected for anonymous
  // visitors, so this query stays quiet and the control just doesn't render.
  const { data: wallet } = useQuery<CreditWallet>({
    queryKey: ["wallet"],
    queryFn: () => api.get<CreditWallet>("/credits/wallet"),
    retry: false,
  });

  const bookedHours =
    startsAt && endsAt
      ? Math.max(0, (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000)
      : 0;
  // Category lives on the parent property, and is only present on the
  // room-detail endpoint's response — hence the optional chain.
  const walletHoursForCategory =
    wallet?.balances.find((b) => b.category === room?.property?.category)?.hours ?? 0;
  // A credit buys an hour of inventory, so it can never exceed the hours booked.
  const maxRedeemable = Math.min(walletHoursForCategory, bookedHours);

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
        redeemCreditHours: Math.min(redeemCreditHours, maxRedeemable),
      });
      if (booking.clientSecret) sessionStorage.setItem(`clientSecret:${booking.id}`, booking.clientSecret);
      router.push(`/booking/${booking.id}/checkout`);
    } catch (err) {
      // Send anonymous users to log in and back here, instead of surfacing
      // the raw backend "Authentication required" 401 message inline.
      if (err instanceof ApiError && err.status === 401) {
        const next = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
        router.push(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
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
      {/* Photographic hero with legible gradient scrim. */}
      <div className="relative mb-6 h-52 overflow-hidden rounded-2xl shadow-card sm:h-72 animate-scale-in">
        <ListingImage src={room.imageUrl} alt={room.name} seed={room.name} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        {room.imageIsAiGenerated && (
          <span className="absolute right-3 top-3 rounded-md bg-ai-600/90 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
            ✨ AI-generated photo — may not depict the actual space
          </span>
        )}
        <div className="absolute bottom-0 p-5 text-white sm:p-6">
          {room.property && (
            <p className="text-xs uppercase tracking-wide text-white/80">
              {room.property.city}, {room.property.country}
            </p>
          )}
          <h1 className="font-display text-2xl font-semibold drop-shadow sm:text-3xl">{room.name}</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">Capacity {room.capacity}</Badge>
            <Badge>{room.minHours}–{room.maxHours}h bookings</Badge>
            {room.amenities.map((a) => (
              <Badge key={a}>{humanizeTag(a)}</Badge>
            ))}
          </div>

          <Stars rating={room.avgRating} count={room.reviewCount} />

          <div>
            <p className="text-xs uppercase text-slate-500">Host rate</p>
            <p className="text-xl font-semibold text-slate-900">
              {room.currency} {room.baseHourlyRate.toFixed(2)}<span className="text-sm font-normal text-slate-500">/hr</span>
            </p>
          </div>

          {aiPrice && <AiPriceCard currency={room.currency} baseRate={room.baseHourlyRate} decision={aiPrice} />}

          {room.property && (
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{room.property.name}</p>
                {room.property.hostVerified && <Badge tone="success">✓ Verified host</Badge>}
              </div>
              <p className="text-sm text-slate-500">{room.property.addressLine}</p>
              {room.property.amenities.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">Property: {room.property.amenities.map(humanizeTag).join(", ")}</p>
              )}
              <p className="mt-2 text-xs text-slate-500">Free cancellation while the booking is unpaid.</p>
            </Card>
          )}

          {room.property && (
            <Card className="overflow-hidden p-0">
              <iframe
                title={`Map of ${room.property.name}`}
                loading="lazy"
                className="h-56 w-full border-0"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${room.property.lng - 0.008}%2C${room.property.lat - 0.006}%2C${room.property.lng + 0.008}%2C${room.property.lat + 0.006}&layer=mapnik&marker=${room.property.lat}%2C${room.property.lng}`}
              />
              <p className="p-3 text-xs text-slate-500">📍 {room.property.addressLine}, {room.property.city}</p>
            </Card>
          )}
        </div>

        <Card className="h-fit p-5">
          <h2 className="font-display mb-4 text-lg font-semibold">Book this room</h2>
          {prefilledStart && prefilledEnd && (
            <p className="mb-3 rounded-lg bg-ai-50 p-2 text-xs text-ai-800">
              ✦ Times pre-filled from your assistant chat — review and confirm below.
            </p>
          )}
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
            {maxRedeemable > 0 && (
              <div className="rounded-lg bg-brand-50 p-3 text-sm">
                <label className="flex flex-wrap items-center gap-2 text-brand-900">
                  <span>Use time credits</span>
                  <input
                    type="number"
                    min={0}
                    max={maxRedeemable}
                    step={0.25}
                    value={redeemCreditHours}
                    onChange={(e) =>
                      setRedeemCreditHours(Math.min(Number(e.target.value) || 0, maxRedeemable))
                    }
                    className="w-20 rounded border border-brand-300 px-2 py-1"
                  />
                  <span className="text-brand-600">of {maxRedeemable.toFixed(2)} hrs available</span>
                </label>
                {redeemCreditHours > 0 && (
                  <p className="mt-1 animate-fade-in text-xs text-brand-600">
                    {redeemCreditHours.toFixed(2)}h covered by credits — only the remainder is charged.
                  </p>
                )}
              </div>
            )}
            {error && <p className="text-sm text-danger-600">{error}</p>}
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner />}
              {submitting ? "Booking…" : "Book & continue to payment"}
            </Button>
          </form>
        </Card>
      </div>

      {/* Reviews */}
      <section className="mt-10">
        <h2 className="font-display mb-4 text-lg font-semibold">
          Reviews{room.reviewCount > 0 ? ` (${room.reviewCount})` : ""}
        </h2>
        {reviews && reviews.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {reviews.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-center justify-between">
                  <Stars rating={r.rating} />
                  <span className="text-xs text-slate-500">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {r.comment && <p className="mt-2 text-sm text-slate-600">“{r.comment}”</p>}
                <p className="mt-2 text-xs text-slate-500">— {r.authorName}, verified guest</p>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            No reviews yet — be the first after you book and complete a stay.
          </p>
        )}
      </section>
    </div>
  );
}
