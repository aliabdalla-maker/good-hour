"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../lib/apiClient";
import { RequireAuth } from "../../../components/RequireAuth";
import { Card } from "../../../components/ui/Card";
import { Spinner } from "../../../components/ui/Spinner";
import { EmptyState } from "../../../components/ui/EmptyState";

/**
 * The operator's payout queue.
 *
 * Payouts are made by hand — the operator sends a bank transfer and records it here.
 * That makes this the most consequential screen in the product, so it is built to
 * resist a mistake rather than to be quick:
 *
 *  * the amount is shown large, because it is the number being typed into a bank
 *  * "Mark as sent" asks for confirmation naming the amount and the seller
 *  * marking a payout failed REQUIRES a reason, since the seller gets that text and
 *    an unexplained reversal is worse than the failure
 *  * oldest first, because that is the fair order to pay
 */

interface PendingPayout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  destinationNote: string | null;
  requestedAt: string;
  sellerEmail: string;
}

export default function AdminPayoutsPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <PayoutQueue />
    </RequireAuth>
  );
}

function PayoutQueue() {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failing, setFailing] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const { data, isPending } = useQuery<PendingPayout[]>({
    queryKey: ["pending-payouts"],
    queryFn: () => api.get<PendingPayout[]>("/wallet/payouts/pending"),
    refetchInterval: 30_000,
  });

  const done = () => {
    setConfirming(null);
    setFailing(null);
    setReason("");
    qc.invalidateQueries({ queryKey: ["pending-payouts"] });
  };

  const markPaid = useMutation({
    mutationFn: (id: string) => api.post(`/wallet/payouts/${id}/paid`, {}),
    onMutate: () => setError(null),
    onSuccess: done,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Couldn't mark that sent"),
  });

  const markFailed = useMutation({
    mutationFn: (id: string) =>
      api.post(`/wallet/payouts/${id}/failed`, { operatorNote: reason.trim() }),
    onMutate: () => setError(null),
    onSuccess: done,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Couldn't mark that failed"),
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Spinner /> <span className="ms-2 text-sm">Loading the queue…</span>
      </div>
    );
  }

  const total = (data ?? []).reduce((sum, p) => sum + p.amount, 0);

  return (
    <div>
      <h1 className="font-display mb-1 text-2xl font-semibold">Payouts</h1>
      <p className="mb-6 text-sm text-slate-500">
        Withdrawals awaiting a bank transfer. The money has already left each seller&apos;s
        spendable balance, so this list is what the platform owes right now.
      </p>

      {error && (
        <Card className="mb-4 border-danger-200 bg-danger-50 p-4">
          <p className="text-sm text-danger-800">{error}</p>
        </Card>
      )}

      {(data ?? []).length === 0 ? (
        <EmptyState
          icon="✓"
          title="Nothing to pay out"
          description="Withdrawal requests appear here as sellers make them, oldest first."
        />
      ) : (
        <>
          <Card className="mb-4 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Owed to sellers</p>
            <p className="text-2xl font-semibold">
              {data![0]!.currency} {total.toFixed(2)}
              <span className="ms-2 text-sm font-normal text-slate-500">
                across {data!.length} request{data!.length === 1 ? "" : "s"}
              </span>
            </p>
          </Card>

          <div className="flex flex-col gap-3">
            {data!.map((p) => (
              <Card key={p.id} className="animate-fade-in-up p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {/* Large, because this is the figure being typed into a bank. */}
                    <p className="text-2xl font-semibold">
                      {p.currency} {p.amount.toFixed(2)}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{p.sellerEmail}</p>
                    <p className="text-xs text-slate-500">
                      Requested {new Date(p.requestedAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setConfirming(p.id)}
                      className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
                    >
                      Mark as sent
                    </button>
                    <button
                      onClick={() => setFailing(p.id)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      Couldn&apos;t send
                    </button>
                  </div>
                </div>

                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Destination</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                    {p.destinationNote ?? (
                      <span className="text-warning-800">
                        No destination given. Contact the seller before sending anything.
                      </span>
                    )}
                  </p>
                </div>

                {confirming === p.id && (
                  <div className="mt-3 animate-fade-in rounded-xl border border-brand-200 bg-brand-50 p-3">
                    <p className="text-sm text-brand-900">
                      Confirm you have sent <strong>{p.currency} {p.amount.toFixed(2)}</strong> to{" "}
                      <strong>{p.sellerEmail}</strong>. This records the transfer; it does not make
                      one.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => markPaid.mutate(p.id)}
                        disabled={markPaid.isPending}
                        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {markPaid.isPending && <Spinner />}
                        Yes, I&apos;ve sent it
                      </button>
                      <button
                        onClick={() => setConfirming(null)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
                      >
                        Not yet
                      </button>
                    </div>
                  </div>
                )}

                {failing === p.id && (
                  <div className="mt-3 animate-fade-in rounded-xl border border-warning-200 bg-warning-50 p-3">
                    <label className="block text-sm text-warning-900">
                      Why couldn&apos;t it be sent? The seller sees this.
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. the account details were rejected"
                        className="mt-1 w-full rounded-lg border border-warning-300 px-3 py-2"
                      />
                    </label>
                    <p className="mt-1 text-xs text-warning-800">
                      {p.currency} {p.amount.toFixed(2)} goes back to their balance.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => markFailed.mutate(p.id)}
                        disabled={markFailed.isPending || reason.trim().length < 5}
                        className="inline-flex items-center gap-2 rounded-lg bg-warning-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {markFailed.isPending && <Spinner />}
                        Return the money
                      </button>
                      <button
                        onClick={() => {
                          setFailing(null);
                          setReason("");
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
