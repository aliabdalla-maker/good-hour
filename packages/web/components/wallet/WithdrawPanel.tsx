"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/apiClient";
import { Card } from "../ui/Card";
import { Spinner } from "../ui/Spinner";

/**
 * Withdrawing wallet balance.
 *
 * Sellers could accrue proceeds with no way to take them out — `PAYOUT` existed only
 * as a ledger label. This is the missing half of the wallet.
 *
 * The copy has one job beyond collecting an amount: telling the truth about how the
 * money moves. It leaves the balance *now* and arrives by bank transfer *later*, and
 * a seller who doesn't know that will read the reduced balance as an error. Manual
 * processing is stated plainly rather than dressed up as instant.
 */

const MIN_PAYOUT = 10;

interface Payout {
  id: string;
  amount: number;
  currency: string;
  status: "REQUESTED" | "PAID" | "FAILED" | "CANCELLED";
  destinationNote: string | null;
  operatorNote: string | null;
  requestedAt: string;
  processedAt: string | null;
}

const STATUS_STYLE: Record<Payout["status"], { label: string; chip: string }> = {
  REQUESTED: { label: "Awaiting transfer", chip: "bg-warning-50 text-warning-800 border-warning-200" },
  PAID: { label: "Sent", chip: "bg-success-50 text-success-800 border-success-200" },
  FAILED: { label: "Couldn't be sent", chip: "bg-danger-50 text-danger-800 border-danger-200" },
  CANCELLED: { label: "Cancelled", chip: "bg-slate-50 text-slate-600 border-slate-200" },
};

export function WithdrawPanel({ balance, currency }: { balance: number; currency: string }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: payouts } = useQuery<Payout[]>({
    queryKey: ["payouts"],
    queryFn: () => api.get<Payout[]>("/wallet/payouts"),
    retry: false,
  });

  const pending = payouts?.find((p) => p.status === "REQUESTED") ?? null;

  const request = useMutation({
    mutationFn: () =>
      api.post<Payout>("/wallet/payouts", {
        amount: Number(amount),
        destinationNote: destination.trim() || undefined,
      }),
    onMutate: () => setError(null),
    onSuccess: () => {
      setAmount("");
      setDestination("");
      qc.invalidateQueries({ queryKey: ["payouts"] });
      qc.invalidateQueries({ queryKey: ["money-wallet"] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Couldn't request that withdrawal"),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.post<Payout>(`/wallet/payouts/${id}/cancel`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payouts"] });
      qc.invalidateQueries({ queryKey: ["money-wallet"] });
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Couldn't cancel that withdrawal"),
  });

  const parsed = Number(amount);
  const tooSmall = amount !== "" && parsed < MIN_PAYOUT;
  const tooLarge = parsed > balance;
  const canSubmit = amount !== "" && parsed >= MIN_PAYOUT && !tooLarge && !pending;

  return (
    <Card className="p-5">
      <h2 className="font-display mb-1 text-lg font-semibold">Withdraw</h2>
      <p className="mb-4 text-sm text-slate-500">
        Money leaves your balance as soon as you request it, and is sent by bank transfer.
        Transfers are made by hand, so allow a few working days.
      </p>

      {pending ? (
        <div className="rounded-xl border border-warning-200 bg-warning-50 p-4">
          <p className="text-sm font-medium text-warning-800">
            {pending.currency} {pending.amount.toFixed(2)} is awaiting transfer
          </p>
          <p className="mt-1 text-xs text-warning-800">
            Requested {new Date(pending.requestedAt).toLocaleString()}. It has already left your
            spendable balance. You can cancel while it is still awaiting transfer.
          </p>
          <button
            onClick={() => cancel.mutate(pending.id)}
            disabled={cancel.isPending}
            className="mt-3 rounded-lg border border-warning-300 px-3 py-1.5 text-sm font-medium text-warning-900 transition hover:bg-warning-100 disabled:opacity-50"
          >
            {cancel.isPending ? "Cancelling…" : "Cancel and return to my balance"}
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) request.mutate();
          }}
          className="flex flex-col gap-3"
        >
          <label className="block text-sm">
            Amount ({currency})
            <input
              type="number"
              min={MIN_PAYOUT}
              max={balance}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={balance >= MIN_PAYOUT ? balance.toFixed(2) : "0.00"}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <label className="block text-sm">
            Where should it go?
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Account name and sort code / IBAN"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Read by a person when they make the transfer.
            </span>
          </label>

          {tooSmall && (
            <p className="text-xs text-warning-800">
              The minimum withdrawal is {currency} {MIN_PAYOUT.toFixed(2)}.
            </p>
          )}
          {tooLarge && (
            <p className="text-xs text-warning-800">
              You can withdraw up to {currency} {balance.toFixed(2)}.
            </p>
          )}
          {balance < MIN_PAYOUT && (
            <p className="text-xs text-slate-500">
              You&apos;ll be able to withdraw once your balance reaches {currency}{" "}
              {MIN_PAYOUT.toFixed(2)}.
            </p>
          )}
          {error && <p className="text-sm text-danger-600">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit || request.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {request.isPending && <Spinner />}
            {request.isPending ? "Requesting…" : "Request withdrawal"}
          </button>
        </form>
      )}

      {payouts && payouts.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Withdrawal history</p>
          <ul className="flex flex-col gap-2">
            {payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">
                  {p.currency} {p.amount.toFixed(2)}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">
                    {new Date(p.processedAt ?? p.requestedAt).toLocaleDateString()}
                  </span>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[p.status].chip}`}
                  >
                    {STATUS_STYLE[p.status].label}
                  </span>
                </span>
                {p.operatorNote && (
                  <span className="w-full text-xs text-slate-500">{p.operatorNote}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
