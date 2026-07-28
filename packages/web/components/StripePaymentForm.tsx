"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";

const stripePromise = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
  : null;

function PayButton({ onSucceeded, label }: { onSucceeded: () => void; label: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message ?? "Payment failed");
      setSubmitting(false);
      return;
    }

    onSucceeded();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "Processing..." : label}
      </button>
      <p className="text-xs text-slate-400">Test card: 4242 4242 4242 4242, any future date, any CVC.</p>
    </form>
  );
}

export function StripePaymentForm({
  clientSecret,
  onSucceeded,
  label = "Pay now",
}: {
  clientSecret: string;
  onSucceeded: () => void;
  /** Button copy — "Top up" reads wrong as "Pay now" on a wallet top-up. */
  label?: string;
}) {
  if (!stripePromise) {
    return <p className="text-sm text-red-600">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not configured.</p>;
  }
  return (
    // Keyed on clientSecret: Elements caches the intent, so reusing the same
    // mounted instance for a second top-up would confirm the first one again.
    <Elements key={clientSecret} stripe={stripePromise} options={{ clientSecret }}>
      <PayButton onSucceeded={onSucceeded} label={label} />
    </Elements>
  );
}
