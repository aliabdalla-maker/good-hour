"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { BookingPublic } from "@gihtcx/shared";
import { api, ApiError } from "../../../../lib/apiClient";
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
  // "loading" until we know whether a card form is possible — showing the
  // "Stripe isn't configured" fallback while still fetching was a lie.
  const [intentState, setIntentState] = useState<"loading" | "ready" | "simulated" | "unavailable">(
    "loading"
  );
  const [intentError, setIntentError] = useState<string | null>(null);

  const { data: booking, refetch } = useQuery<BookingPublic>({
    queryKey: ["booking", id],
    queryFn: () => api.get<BookingPublic>(`/bookings/${id}`),
    refetchInterval: (query) => (query.state.data?.status === "PENDING_PAYMENT" ? 2000 : false),
  });

  // sessionStorage is only a fast path. If it's empty — new tab, reload, came
  // back later — ask the API for a secret using the booking id, so a real
  // PENDING_PAYMENT booking is never stranded with no way to pay it.
  useEffect(() => {
    const cached = sessionStorage.getItem(`clientSecret:${id}`);
    if (cached) {
      setClientSecret(cached);
      setIntentState("ready");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api.post<{ clientSecret: string | null; simulated: boolean }>(
          `/payments/${id}/intent`
        );
        if (cancelled) return;
        if (r.clientSecret) {
          sessionStorage.setItem(`clientSecret:${id}`, r.clientSecret);
          setClientSecret(r.clientSecret);
        }
        setIntentState(r.simulated ? "simulated" : "ready");
      } catch (err) {
        if (cancelled) return;
        // NOTHING_TO_PAY / NOT_PAYABLE are legitimate states, not faults —
        // the polling query below will show the confirmed/expired outcome.
        setIntentState("unavailable");
        setIntentError(
          err instanceof ApiError ? err.message : "We couldn't start the payment for this booking."
        );
      }
    })();
    return () => {
      cancelled = true;
    };
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
  // totalAmount is deliberately GROSS; credits reduce what's charged, so the
  // card amount must be shown separately or it won't match the total above it.
  const creditApplied = booking.creditValueApplied ?? 0;
  const cashDue = Math.max(0, Math.round((booking.totalAmount - creditApplied) * 100) / 100);

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
          {creditApplied > 0 && (
            <>
              <div className="flex justify-between text-brand-800">
                <dt>Paid with time credits</dt>
                <dd>− {booking.currency} {creditApplied.toFixed(2)}</dd>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-1 text-base font-semibold">
                <dt>Due now</dt>
                <dd>{booking.currency} {cashDue.toFixed(2)}</dd>
              </div>
            </>
          )}
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
          <StripePaymentForm
            clientSecret={clientSecret}
            label={`Pay ${booking.currency} ${cashDue.toFixed(2)}`}
            onSucceeded={() => refetch()}
          />
        ) : intentState === "loading" ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
            <Spinner /> Preparing secure payment…
          </div>
        ) : intentState === "simulated" ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="mb-3 text-sm text-amber-800">
              Stripe keys aren&apos;t configured in this environment, so payment is simulated.
            </p>
            <Button variant="primary" onClick={handleSimulatePayment} disabled={simulating}>
              {simulating && <Spinner />}
              {simulating ? "Processing…" : "Simulate successful payment"}
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">
              {intentError ?? "We couldn't start the payment for this booking."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => window.location.reload()}>
                Try again
              </Button>
              <Button variant="primary" onClick={() => router.push("/dashboard/traveller")}>
                My bookings
              </Button>
            </div>
          </div>
        )}

        <p className="mt-4 flex items-center justify-center gap-1 text-xs text-slate-500">
          <span aria-hidden="true">🔒</span> Payments secured by Stripe · funds held until check-in
        </p>
      </Card>
    </div>
  );
}
