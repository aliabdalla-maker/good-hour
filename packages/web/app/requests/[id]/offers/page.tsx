"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BookingRequestPublic, SupplierOfferPublic, PropertyWithRooms } from "@gihtcx/shared";
import { useCurrentUser } from "../../../../lib/useCurrentUser";
import { api, ApiError } from "../../../../lib/apiClient";

import { RequireAuth } from "../../../../components/RequireAuth";

export default function BookingRequestOffersPage() {
  return (
    <RequireAuth>
      <BookingRequestOffersPageInner />
    </RequireAuth>
  );
}

function BookingRequestOffersPageInner() {
  const { id } = useParams<{ id: string }>();
  const { data: user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);

  const { data: bookingRequest } = useQuery<BookingRequestPublic>({
    queryKey: ["booking-request", id],
    queryFn: () => api.get<BookingRequestPublic>(`/bidding/requests/${id}`),
    refetchInterval: (query) => (query.state.data?.status === "OPEN" ? 3000 : false),
  });

  const { data: offers } = useQuery<SupplierOfferPublic[]>({
    queryKey: ["offers", id],
    queryFn: () => api.get<SupplierOfferPublic[]>(`/bidding/requests/${id}/offers`),
    refetchInterval: 3000,
  });

  const { data: myProperties } = useQuery<PropertyWithRooms[]>({
    queryKey: ["my-properties"],
    queryFn: () => api.get<PropertyWithRooms[]>("/listings/properties"),
    enabled: user?.role === "SUPPLIER",
  });

  async function handleAccept(offerId: string) {
    setError(null);
    setAccepting(offerId);
    try {
      const booking = await api.post<{ id: string; clientSecret: string | null }>(
        `/bidding/offers/${offerId}/accept`
      );
      if (booking.clientSecret) {
        sessionStorage.setItem(`clientSecret:${booking.id}`, booking.clientSecret);
      }
      window.location.href = `/booking/${booking.id}/checkout`;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not accept offer");
      setAccepting(null);
    }
  }

  async function handleSubmitOffer(roomId: string, offeredRate: number, hours: number) {
    setError(null);
    try {
      await api.post("/bidding/offers", {
        bookingRequestId: id,
        roomId,
        offeredRate,
        offeredTotal: Math.round(offeredRate * hours * 100) / 100,
      });
      queryClient.invalidateQueries({ queryKey: ["offers", id] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not submit offer");
    }
  }

  if (!bookingRequest) return <p className="text-slate-500">Loading...</p>;

  const hours = Math.round(
    (new Date(bookingRequest.desiredEnd).getTime() - new Date(bookingRequest.desiredStart).getTime()) /
      (60 * 60 * 1000)
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Request in {bookingRequest.locationQuery}</h1>
      <p className="text-slate-500">
        {new Date(bookingRequest.desiredStart).toLocaleString()} - {new Date(bookingRequest.desiredEnd).toLocaleString()} ·{" "}
        Status: {bookingRequest.status}
      </p>

      {error && <p className="mt-2 text-sm text-danger-600">{error}</p>}

      <h2 className="font-display mb-2 mt-6 font-medium">Offers</h2>
      <div className="flex flex-col gap-3">
        {offers?.map((offer) => (
          <div key={offer.id} className="flex items-center justify-between rounded border border-slate-200 bg-white p-4">
            <div>
              <p className="font-medium">
                {offer.offeredRate}/hr · total {offer.offeredTotal}
                {offer.status === "RECOMMENDED" && (
                  <span className="ms-2 rounded bg-success-100 px-2 py-0.5 text-xs text-success-800">
                    AI-recommended
                  </span>
                )}
                {offer.isAgentSubmitted && (
                  <span className="ms-2 rounded bg-info-100 px-2 py-0.5 text-xs text-info-800">
                    Auto-submitted by supplier agent
                  </span>
                )}
              </p>
              {offer.message && <p className="text-sm text-slate-500">{offer.message}</p>}
              <p className="text-xs text-slate-500">Status: {offer.status}</p>
            </div>
            {user?.id === bookingRequest.travellerId && bookingRequest.status === "OPEN" && offer.status !== "REJECTED" && (
              <button
                onClick={() => handleAccept(offer.id)}
                disabled={accepting === offer.id}
                className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {accepting === offer.id ? "Accepting..." : "Accept"}
              </button>
            )}
          </div>
        ))}
        {offers?.length === 0 && (
          <p className="text-slate-500">
            No offers yet. Hosts who have turned on auto-offer respond within seconds, and others
            may bid manually before this request expires.
          </p>
        )}
      </div>

      {user?.role === "SUPPLIER" && bookingRequest.status === "OPEN" && myProperties && (
        <div className="mt-8 rounded border border-slate-200 bg-white p-4">
          <h2 className="font-display mb-3 font-medium">Submit an offer from one of your rooms</h2>
          <div className="flex flex-col gap-2">
            {myProperties.flatMap((property) =>
              property.rooms.map((room) => (
                <SupplierOfferRow
                  key={room.id}
                  roomName={`${property.name}: ${room.name}`}
                  baseRate={room.baseHourlyRate}
                  onSubmit={(rate) => handleSubmitOffer(room.id, rate, hours)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SupplierOfferRow({
  roomName,
  baseRate,
  onSubmit,
}: {
  roomName: string;
  baseRate: number;
  onSubmit: (rate: number) => void;
}) {
  const [rate, setRate] = useState(baseRate);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
      <span className="text-sm">{roomName}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="w-24 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button onClick={() => onSubmit(rate)} className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white">
          Offer
        </button>
      </div>
    </div>
  );
}
