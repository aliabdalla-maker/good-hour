"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { PropertyWithRooms } from "@gihtcx/shared";
import { api, ApiError } from "../../../lib/apiClient";

export default function SupplierDashboardPage() {
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
      <h1 className="mb-6 text-2xl font-semibold">Supplier dashboard</h1>

      <form onSubmit={handleCreateProperty} className="mb-8 grid grid-cols-1 gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <h2 className="col-span-full font-medium">Add a property</h2>
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

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <h2 className="mb-3 font-medium">Your properties</h2>
      <div className="flex flex-col gap-4">
        {properties?.map((property) => (
          <PropertyCard key={property.id} property={property} onRoomAdded={() => queryClient.invalidateQueries({ queryKey: ["my-properties"] })} />
        ))}
      </div>
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
        baseHourlyRate,
        currency: "GBP",
        minHours,
        maxHours,
        autoOfferEnabled,
      });
      setRoomName("");
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
          <li key={room.id} className="flex items-center justify-between">
            <span>{room.name} — {room.currency} {room.baseHourlyRate}/hr ({room.minHours}-{room.maxHours}h)</span>
            {room.autoOfferEnabled && (
              <span className="rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-800">Auto-offer on</span>
            )}
          </li>
        ))}
        {property.rooms.length === 0 && <li className="text-slate-400">No rooms yet</li>}
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
          {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}
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
