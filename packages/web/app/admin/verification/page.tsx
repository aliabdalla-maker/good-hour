"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { PendingSupplier } from "@gihtcx/shared";
import { api } from "../../../lib/apiClient";

import { RequireAuth } from "../../../components/RequireAuth";

export default function AdminVerificationPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <AdminVerificationPageInner />
    </RequireAuth>
  );
}

function AdminVerificationPageInner() {
  const qc = useQueryClient();
  const { data: pending, isPending } = useQuery<PendingSupplier[]>({
    queryKey: ["pending-suppliers"],
    queryFn: () => api.get<PendingSupplier[]>("/verification/pending"),
  });

  const decide = useMutation({
    mutationFn: ({ userId, approve }: { userId: string; approve: boolean }) =>
      api.post(`/verification/${userId}/decision`, { approve }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-suppliers"] }),
  });

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Host verification queue</h1>
      <p className="mb-6 text-sm text-slate-500">Approve hosts to give their listings a Verified badge.</p>
      {isPending && <p className="text-slate-500">Loading…</p>}
      <div className="flex flex-col gap-3">
        {pending?.map((s) => (
          <div key={s.userId} className="rounded border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">{s.email}</p>
                {s.note && <p className="text-sm text-slate-500">{s.note}</p>}
                <p className="text-xs text-slate-500">Submitted {new Date(s.submittedAt).toLocaleString()}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => decide.mutate({ userId: s.userId, approve: true })}
                  disabled={decide.isPending}
                  className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"
                >
                  Approve
                </button>
                <button
                  onClick={() => decide.mutate({ userId: s.userId, approve: false })}
                  disabled={decide.isPending}
                  className="rounded bg-red-600 px-3 py-1.5 text-sm text-white disabled:opacity-60"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
        {pending && pending.length === 0 && (
          <p className="text-slate-500">No suppliers awaiting verification.</p>
        )}
      </div>
    </div>
  );
}
