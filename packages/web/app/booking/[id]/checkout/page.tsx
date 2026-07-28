"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { BookingPublic } from "@gihtcx/shared";
import { api } from "../../../../lib/apiClient";
import { StripePaymentForm } from "../../../../components/StripePaymentForm";
import { Card } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { Spinner } from "../../../../components/ui/Spinner";
import { Skeleton } from "../../../../components/ui/Skeleton";
import { Stepper } from "../../../../components/ui/Stepper";
import { useToast } from "../../../../components/ui/Toast";

const STEPS = ["Book", "Pay", "Confirmed"];

import { RequireAuth } from "../../../../components/RequireAuth";

export default function CheckoutPage() {
  return (
    <RequireAuth>
      <CheckoutPageInner />
    </RequireAuth>
  );
}

function CheckoutPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  const { data: booking, refetch } = useQuery<BookingPublic>({
    queryKey: ["booking", id],
    queryFn: () => api.get<BookingPublic>(`/bookings/${id}`),
    refetchInterval: (query) => (query.state.data?.status === "PENDING_PAYMENT" ? 2000 : false),
  });

  useEffect(() => {
    setClientSecret(sessionStorage.getItem(`clientSecret:${id}`));
  }, [id]);

  async function handleSimulatePayment() {
    setSimulating(true);
    try {
      await api.post(`/payments/${id}/simulate-succeeded`);
      await refetch();
      toast("Payment confirmed", "success");
    } catch {
      toast("Payment failed", "error");
    } finally {
      setSimulating(false);
    }
  }

  if (!booking) return <Skeleton className="mx-auto h-72 max-w-md rounded-2xl" />;

  const confirmed = booking.status === "CONFIRMED" || booking.status === "COMPLETED";
  const travellerFee = Math.max(0, booking.totalAmount - booking.subtotalAmount);

  return (
    <div className="mx-auto max-w-md">
      <Stepper steps={STEPS} current={confirmed ? 2 : 1} />

      <Card className="p-6">
        <dl className="mb-5 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Room subtotal</dt>
            <dd>{booking.currency} {booking.subtotalAmount.toFixed(2)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Platform service fee</dt>
            <dd>{booking.currency} {travellerFee.toFixed(2)}</dd>
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-1 text-base font-semibold">
            <dt>Total</dt>
            <dd>{booking.currency} {booking.totalAmount.toFixed(2)}</dd>
          </div>
        </dl>

        {confirmed ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
            <p className="text-lg font-semibold text-emerald-800">Booking confirmed</p>
            <p className="mt-1 text-sm text-emerald-700">
              {new Date(booking.startsAt).toLocaleString()} – {new Date(booking.endsAt).toLocaleString()}
            </p>
            <Button className="mt-4" onClick={() => router.push("/dashboard/traveller")}>
              View my bookings
            </Button>
          </div>
        ) : clientSecret ? (
          <StripePaymentForm clientSecret={clientSecret} onSucceeded={() => refetch()} />
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-3 text-sm text-amber-800">
              Stripe test keys aren&apos;t configured, so payment is simulated for this demo.
            </p>
            <Button variant="primary" onClick={handleSimulatePayment} disabled={simulating}>
              {simulating && <Spinner />}
              {simulating ? "Processing…" : "Simulate successful payment"}
            </Button>
          </div>
        )}

        <p className="mt-4 flex items-center justify-center gap-1 text-xs text-slate-500">
          <span aria-hidden="true">🔒</span> Payments secured by Stripe · funds held until check-in
        </p>
      </Card>
    </div>
  );
}
