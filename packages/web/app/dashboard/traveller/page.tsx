"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { BookingPublic } from "@gihtcx/shared";
import { api } from "../../../lib/apiClient";
import { ReviewForm } from "../../../components/ReviewForm";

const REVIEWABLE = new Set(["CONFIRMED", "COMPLETED"]);

export default function TravellerDashboardPage() {
  const { data: bookings } = useQuery<BookingPublic[]>({
    queryKey: ["my-bookings"],
    queryFn: () => api.get<BookingPublic[]>("/bookings"),
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">My bookings</h1>
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
                <p className="text-xs uppercase text-slate-400">{booking.status}</p>
              </div>
            </Link>
            {REVIEWABLE.has(booking.status) && <ReviewForm bookingId={booking.id} />}
          </div>
        ))}
        {bookings?.length === 0 && <p className="text-slate-500">No bookings yet.</p>}
      </div>
    </div>
  );
}
