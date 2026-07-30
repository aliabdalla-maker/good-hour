"use client";

import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { PropertyWithRooms, VerificationStatusView, SupplierEarnings } from "@gihtcx/shared";
import { api, ApiError } from "../../../lib/apiClient";
import { Badge } from "../../../components/ui/Badge";

import { RequireAuth } from "../../../components/RequireAuth";

export default function SupplierDashboardPage() {
  return (
    <RequireAuth roles={["SUPPLIER", "ADMIN"]}>
      <SupplierDashboardPageInner />
    </RequireAuth>
  );
}

function SupplierDashboardPageInner() {
  const queryClient = useQueryClient();
  const { data: properties } = useQuery<PropertyWithRooms[]>({
    queryKey: ["my-properties"],
    queryFn: () => api.get<PropertyWithRooms[]>("/listings/properties"),
  });

  const [error, setError] = useState<string | null>(null);

  // Property form state
  const [name, setName] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("UK");
  const [lat, setLat] = useState("51.5074");
  const [lng, setLng] = useState("-0.1278");

  async function handleCreateProperty(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/listings/properties", {
        name,
        addressLine,
        city,
        country,
        lat: Number(lat),
        lng: Number(lng),
        amenities: [],
      });
      queryClient.invalidateQueries({ queryKey: ["my-properties"] });
      setName("");
      setAddressLine("");
      setCity("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create property");
    }
  }

  return (
    <div>
      <h1 className="font-display mb-6 text-2xl font-semibold">Supplier dashboard</h1>

      <EarningsSection />
      <VerificationCard />

      <form onSubmit={handleCreateProperty} className="mb-8 grid grid-cols-1 gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <h2 className="font-display col-span-full font-medium">Add a property</h2>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required className="rounded border border-slate-300 px-2 py-1" />
        <input placeholder="Address" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} required className="rounded border border-slate-300 px-2 py-1" />
        <input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} required className="rounded border border-slate-300 px-2 py-1" />
        <input placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        <input placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        <input placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        <button type="submit" className="col-span-full rounded bg-slate-900 px-4 py-2 text-white sm:w-fit">
          Add property
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-danger-600">{error}</p>}

      <h2 className="font-display mb-3 font-medium">Your properties</h2>
      <div className="flex flex-col gap-4">
        {properties?.map((property) => (
          <PropertyCard key={property.id} property={property} onRoomAdded={() => queryClient.invalidateQueries({ queryKey: ["my-properties"] })} />
        ))}
      </div>
    </div>
  );
}

function EarningsSection() {
  const { data } = useQuery<SupplierEarnings>({
    queryKey: ["supplier-earnings"],
    queryFn: () => api.get<SupplierEarnings>("/bookings/supplier"),
  });
  if (!data) return null;
  const money = (n: number) => `${data.currency} ${n.toFixed(2)}`;

  return (
    <div className="mb-8 animate-fade-in-up">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div
          className="rounded-2xl p-5 text-white shadow-card"
          style={{ backgroundImage: "linear-gradient(135deg,#00665e,#004c46 55%,#632bc0)" }}
        >
          <p className="text-xs uppercase tracking-wide text-white/80">Total earned</p>
          <p className="mt-1 text-3xl font-semibold">{money(data.totalEarned)}</p>
          <p className="mt-1 text-xs text-white/75">from confirmed &amp; completed bookings</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active bookings</p>
          <p className="mt-1 text-3xl font-semibold text-brand-600">{data.confirmedCount}</p>
          <p className="mt-1 text-xs text-slate-500">confirmed &amp; upcoming</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total bookings</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">{data.bookings.length}</p>
          <p className="mt-1 text-xs text-slate-500">all time</p>
        </div>
      </div>

      {data.bookings.length > 0 && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
          <h2 className="font-display mb-1 font-medium">Recent bookings</h2>
          <div className="flex flex-col divide-y divide-slate-100">
            {data.bookings.slice(0, 8).map((b) => (
              <div key={b.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium">{b.itemName}</p>
                  <p className="text-xs text-slate-500">{new Date(b.startsAt).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-800">{money(b.payout)}</p>
                  <span className="text-xs uppercase tracking-wide text-slate-500">{b.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VerificationCard() {
  const qc = useQueryClient();
  const { data: status } = useQuery<VerificationStatusView>({
    queryKey: ["verification-me"],
    queryFn: () => api.get<VerificationStatusView>("/verification/me"),
  });
  const [businessName, setBusinessName] = useState("");
  const [registrationId, setRegistrationId] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      api.post("/verification/submit", {
        businessName,
        registrationId: registrationId || undefined,
        contactPhone: contactPhone || undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["verification-me"] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not submit"),
  });

  const tone =
    status?.status === "VERIFIED" ? "success"
    : status?.status === "PENDING" ? "warning"
    : status?.status === "REJECTED" ? "danger"
    : "neutral";
  const canSubmit = status?.status === "UNVERIFIED" || status?.status === "REJECTED";

  return (
    <div className="mb-8 rounded border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-medium">Host verification</h2>
        <Badge tone={tone}>{status?.status ?? "…"}</Badge>
      </div>
      {status?.status === "VERIFIED" && (
        <p className="mt-2 text-sm text-success-600">✓ Your listings show a Verified badge to travellers.</p>
      )}
      {status?.status === "PENDING" && (
        <p className="mt-2 text-sm text-slate-500">Your submission is under review by our team.</p>
      )}
      {canSubmit && (
        <div className="mt-3">
          <p className="mb-2 text-sm text-slate-500">
            Get a Verified badge on your listings — submit your business details for review.
          </p>
          {status?.status === "REJECTED" && status.note && (
            <p className="mb-2 text-sm text-danger-600">Previous decision: {status.note}</p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input placeholder="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm" />
            <input placeholder="Registration ID (optional)" value={registrationId} onChange={(e) => setRegistrationId(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm" />
            <input placeholder="Contact phone (optional)" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm" />
          </div>
          {error && <p className="mt-1 text-sm text-danger-600">{error}</p>}
          <button
            onClick={() => {
              setError(null);
              if (businessName.trim().length < 2) { setError("Enter your business name"); return; }
              submit.mutate();
            }}
            disabled={submit.isPending}
            className="mt-2 rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {submit.isPending ? "Submitting…" : "Request verification"}
          </button>
        </div>
      )}
    </div>
  );
}

function PropertyCard({ property, onRoomAdded }: { property: PropertyWithRooms; onRoomAdded: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [capacity, setCapacity] = useState(2);
  const [baseHourlyRate, setBaseHourlyRate] = useState(20);
  const [minHours, setMinHours] = useState(2);
  const [maxHours, setMaxHours] = useState(12);
  const [autoOfferEnabled, setAutoOfferEnabled] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageIsAiGenerated, setImageIsAiGenerated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post("/listings/rooms", {
        propertyId: property.id,
        name: roomName,
        capacity,
        amenities: ["wifi"],
        imageUrl: imageUrl || undefined,
        imageIsAiGenerated,
        baseHourlyRate,
        currency: "GBP",
        minHours,
        maxHours,
        autoOfferEnabled,
      });
      setRoomName("");
      setImageUrl("");
      setImageIsAiGenerated(false);
      setShowForm(false);
      onRoomAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create room");
    }
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <h3 className="font-medium">{property.name}</h3>
      <p className="text-sm text-slate-500">{property.city}, {property.country}</p>

      <ul className="mt-3 flex flex-col gap-1 text-sm">
        {property.rooms.map((room) => (
          <li key={room.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>{room.name} — {room.currency} {room.baseHourlyRate}/hr ({room.minHours}-{room.maxHours}h)</span>
            <AutoOfferToggle room={room} onChanged={onRoomAdded} />
          </li>
        ))}
        {property.rooms.length === 0 && <li className="text-slate-500">No rooms yet</li>}
      </ul>

      {showForm ? (
        <form onSubmit={handleCreateRoom} className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3">
          <input placeholder="Room name" value={roomName} onChange={(e) => setRoomName(e.target.value)} required className="col-span-2 rounded border border-slate-300 px-2 py-1 text-sm" />
          <input type="number" placeholder="Capacity" value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="rounded border border-slate-300 px-2 py-1 text-sm" />
          <input type="number" placeholder="Hourly rate" value={baseHourlyRate} onChange={(e) => setBaseHourlyRate(Number(e.target.value))} className="rounded border border-slate-300 px-2 py-1 text-sm" />
          <input type="number" placeholder="Min hours" value={minHours} onChange={(e) => setMinHours(Number(e.target.value))} className="rounded border border-slate-300 px-2 py-1 text-sm" />
          <input type="number" placeholder="Max hours" value={maxHours} onChange={(e) => setMaxHours(Number(e.target.value))} className="rounded border border-slate-300 px-2 py-1 text-sm" />
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoOfferEnabled} onChange={(e) => setAutoOfferEnabled(e.target.checked)} />
            Let this room&apos;s agent auto-offer on matching bid requests (B2A)
          </label>

          <div className="col-span-2 rounded-lg border border-dashed border-slate-200 p-2">
            <p className="mb-1 text-xs font-medium text-slate-500">Photo (optional)</p>
            <div className="flex gap-2">
              {imageUrl && (
                <img src={imageUrl} alt="Preview" className="h-14 w-14 shrink-0 rounded object-cover" />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <input
                  placeholder="Image URL, e.g. https://… or /listings/room.jpg"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                />
                {/* Disclosure is a supplier declaration now that nothing on the
                    platform generates images. Browse/search still label it, so
                    a host using an AI tool elsewhere can stay honest. */}
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={imageIsAiGenerated}
                    onChange={(e) => setImageIsAiGenerated(e.target.checked)}
                  />
                  This photo was AI-generated (it will be labelled on the listing)
                </label>
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => { setImageUrl(""); setImageIsAiGenerated(false); }}
                    className="w-fit text-xs text-slate-500 hover:text-danger-500"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>
          </div>

          {error && <p className="col-span-2 text-sm text-danger-600">{error}</p>}
          <button type="submit" className="col-span-2 rounded bg-slate-900 px-3 py-1.5 text-sm text-white sm:w-fit">
            Add room
          </button>
        </form>
      ) : (
        <button onClick={() => setShowForm(true)} className="mt-3 text-sm font-medium text-slate-700 underline">
          + Add a room
        </button>
      )}
    </div>
  );
}

/**
 * Turns the B2A supplier agent on or off for a room that already exists.
 *
 * Until now this flag could only be chosen in the create-room form, so every
 * live room was stuck OFF and no booking request could ever attract an
 * auto-offer — the reverse auction looked broken when it was simply opted out
 * of by default.
 */
function AutoOfferToggle({
  room,
  onChanged,
}: {
  room: { id: string; autoOfferEnabled: boolean };
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const toggle = useMutation({
    mutationFn: () =>
      api.patch(`/listings/rooms/${room.id}`, { autoOfferEnabled: !room.autoOfferEnabled }),
    onMutate: () => setError(null),
    onSuccess: onChanged,
    onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't change that"),
  });

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-danger-600">{error}</span>}
      <button
        type="button"
        onClick={() => toggle.mutate()}
        disabled={toggle.isPending}
        aria-pressed={room.autoOfferEnabled}
        title="When on, this room's agent bids automatically on matching booking requests"
        className={`inline-flex min-h-6 items-center rounded-full px-2.5 py-1 text-xs font-medium transition disabled:opacity-60 ${
          room.autoOfferEnabled
            ? "bg-info-100 text-info-900 hover:bg-info-200"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        {toggle.isPending ? "Saving…" : room.autoOfferEnabled ? "✦ Auto-offer on" : "Auto-offer off"}
      </button>
    </span>
  );
}
