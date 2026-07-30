"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { BookingPublic } from "@gihtcx/shared";
import { api, ApiError } from "../../../lib/apiClient";
import { ReviewForm } from "../../../components/ReviewForm";
import { MessageThread } from "../../../components/MessageThread";

const REVIEWABLE = new Set(["CONFIRMED", "COMPLETED"]);
const CANCELLABLE = new Set(["PENDING_PAYMENT", "CONFIRMED"]);

function CancelButton({ bookingId }: { bookingId: string }) {
  const qc = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const cancel = useMutation({
    mutationFn: () => api.post(`/bookings/${bookingId}/cancel`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-bookings"] }),
    onError: (e) => setErr(e instanceof ApiError ? e.message : "Could not cancel"),
  });
  return (
    <span className="ml-3">
      <button
        onClick={() => {
          if (window.confirm("Cancel this booking? If it was paid, you'll be refunded to your card.")) {
            setErr(null);
            cancel.mutate();
          }
        }}
        disabled={cancel.isPending}
        className="text-sm font-medium text-danger-600 underline disabled:opacity-60"
      >
        {cancel.isPending ? "Cancelling…" : "Cancel booking"}
      </button>
      {err && <span className="ml-2 text-xs text-danger-600">{err}</span>}
    </span>
  );
}

import { RequireAuth } from "../../../components/RequireAuth";

export default function TravellerDashboardPage() {
  return (
    <RequireAuth roles={["TRAVELLER", "ADMIN"]}>
      <TravellerDashboardPageInner />
    </RequireAuth>
  );
}

function TravellerDashboardPageInner() {
  const { data: bookings } = useQuery<BookingPublic[]>({
    queryKey: ["my-bookings"],
    queryFn: () => api.get<BookingPublic[]>("/bookings"),
  });

  return (
    <div>
      <h1 className="font-display mb-6 text-2xl font-semibold">My bookings</h1>
      <div className="flex flex-col gap-3">
        {bookings?.map((booking) => (
          <div key={booking.id} className="rounded border border-slate-200 bg-white p-4">
            <Link href={`/booking/${booking.id}/checkout`} className="flex items-center justify-between hover:opacity-80">
              <div>
                <p className="font-medium">
                  {new Date(booking.startsAt).toLocaleString()} - {new Date(booking.endsAt).toLocaleString()}
                </p>
                <p className="text-sm text-slate-500">
                  {booking.source === "REVERSE_BID" ? "Via reverse-bid request" : "Direct search booking"}
                  {booking.isAgentAccepted && " · auto-accepted by your agent"}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">
                  {booking.currency} {booking.totalAmount.toFixed(2)}
                </p>
                <p className="text-xs uppercase text-slate-500">{booking.status}</p>
              </div>
            </Link>
            <div className="mt-2">
              {REVIEWABLE.has(booking.status) && (
                <Link href={`/booking/${booking.id}/receipt`} className="text-sm font-medium text-brand-600 underline">
                  View receipt
                </Link>
              )}
              {CANCELLABLE.has(booking.status) && <CancelButton bookingId={booking.id} />}
            </div>
            <MessageThread bookingId={booking.id} />
            {REVIEWABLE.has(booking.status) && <ReviewForm bookingId={booking.id} />}
          </div>
        ))}
        {bookings?.length === 0 && <p className="text-slate-500">No bookings yet.</p>}
      </div>
    </div>
  );
}
