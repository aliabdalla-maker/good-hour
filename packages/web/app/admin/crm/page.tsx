"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CrmSummary, CrmContactDetail, CrmStage } from "@gihtcx/shared";
import { api } from "../../../lib/apiClient";
import { RequireAuth } from "../../../components/RequireAuth";

const STAGES: CrmStage[] = ["LEAD", "ACTIVE", "VIP", "DORMANT"];
const STAGE_TONE: Record<CrmStage, string> = {
  LEAD: "bg-slate-100 text-slate-600",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  VIP: "bg-ai-50 text-ai-700",
  DORMANT: "bg-amber-50 text-amber-700",
};

export default function CrmPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <CrmInner />
    </RequireAuth>
  );
}

function CrmInner() {
  const { data } = useQuery<CrmSummary>({ queryKey: ["crm-contacts"], queryFn: () => api.get<CrmSummary>("/crm/contacts") });
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const contacts = (data?.contacts ?? []).filter((c) => c.email.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">CRM</h1>
      <p className="mb-6 text-sm text-slate-500">Every customer — travellers and hosts — with lifecycle, activity and notes.</p>

      {/* Stage summary */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total" value={data?.total ?? 0} gradient />
        {STAGES.map((s) => (
          <StatCard key={s} label={s} value={data?.byStage?.[s] ?? 0} />
        ))}
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by email…"
        className="mb-4 w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        {/* Contact table */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2 text-right">Bookings</th>
                <th className="px-3 py-2 text-right">Spent</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr
                  key={c.userId}
                  onClick={() => setSelected(c.userId)}
                  className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${selected === c.userId ? "bg-brand-50" : ""}`}
                >
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-800">{c.email}</p>
                    <p className="text-xs text-slate-500">{c.role.toLowerCase()}{c.propertiesCount > 0 ? ` · ${c.propertiesCount} listings` : ""}</p>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_TONE[c.stage]}`}>{c.stage}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{c.bookingsCount}</td>
                  <td className="px-3 py-2 text-right font-medium">£{c.totalSpent.toFixed(0)}</td>
                </tr>
              ))}
              {contacts.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No contacts.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detail */}
        <div>{selected ? <ContactDetail userId={selected} /> : <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Select a customer to see their timeline and notes.</p>}</div>
      </div>
    </div>
  );
}

function StatCard({ label, value, gradient }: { label: string; value: number; gradient?: boolean }) {
  return (
    <div
      className={`rounded-2xl p-4 shadow-card ${gradient ? "text-white" : "border border-slate-200 bg-white"}`}
      style={gradient ? { backgroundImage: "linear-gradient(135deg,#0f766e,#115e59 55%,#6d28d9)" } : undefined}
    >
      <p className={`text-xs uppercase tracking-wide ${gradient ? "text-white/80" : "text-slate-500"}`}>{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${gradient ? "" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function ContactDetail({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery<CrmContactDetail>({ queryKey: ["crm-contact", userId], queryFn: () => api.get<CrmContactDetail>(`/crm/contacts/${userId}`) });
  const [note, setNote] = useState("");
  const [tagInput, setTagInput] = useState("");

  const patch = useMutation({
    mutationFn: (body: { stage?: CrmStage; tags?: string[] }) => api.patch(`/crm/contacts/${userId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm-contact", userId] });
      qc.invalidateQueries({ queryKey: ["crm-contacts"] });
    },
  });
  const addNote = useMutation({
    mutationFn: () => api.post(`/crm/contacts/${userId}/notes`, { body: note }),
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["crm-contact", userId] });
      qc.invalidateQueries({ queryKey: ["crm-contacts"] });
    },
  });

  if (!data) return <p className="rounded-2xl border border-slate-200 p-6 text-sm text-slate-500">Loading…</p>;
  const c = data.contact;

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div>
        <p className="font-semibold">{c.email}</p>
        <p className="text-xs text-slate-500">{c.role.toLowerCase()} · joined {new Date(c.createdAt).toLocaleDateString()} · {c.verificationStatus}</p>
      </div>

      {/* Stage */}
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">Lifecycle stage</p>
        <div className="flex flex-wrap gap-1.5">
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => patch.mutate({ stage: s })}
              className={`rounded-full px-3 py-1 text-xs font-medium ${c.stage === s ? STAGE_TONE[s] + " ring-1 ring-current" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Tags */}
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">Tags</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {c.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {t}
              <button onClick={() => patch.mutate({ tags: c.tags.filter((x) => x !== t) })} className="text-slate-500 hover:text-red-500">×</button>
            </span>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const t = tagInput.trim();
              if (t && !c.tags.includes(t)) patch.mutate({ tags: [...c.tags, t] });
              setTagInput("");
            }}
          >
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="+ tag" className="w-20 rounded-full border border-slate-200 px-2 py-0.5 text-xs" />
          </form>
        </div>
      </div>

      {/* Notes */}
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">Notes</p>
        <div className="flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note…" className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-sm" />
          <button onClick={() => note.trim() && addNote.mutate()} disabled={addNote.isPending} className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50">Add</button>
        </div>
        <div className="mt-2 space-y-1.5">
          {data.notes.map((n) => (
            <div key={n.id} className="rounded-lg bg-slate-50 px-2 py-1.5 text-sm text-slate-700">
              {n.body}
              <span className="ml-1 text-[11px] text-slate-500">· {new Date(n.createdAt).toLocaleDateString()}</span>
            </div>
          ))}
          {data.notes.length === 0 && <p className="text-xs text-slate-500">No notes yet.</p>}
        </div>
      </div>

      {/* Timeline */}
      <div>
        <p className="mb-1 text-xs font-medium text-slate-500">Activity</p>
        <ol className="space-y-2 border-l border-slate-200 pl-3">
          {data.timeline.map((t, i) => (
            <li key={i} className="relative text-sm">
              <span className="absolute -left-[17px] top-1.5 h-2 w-2 rounded-full bg-brand-400" />
              <p className="text-slate-700">{t.label}</p>
              {t.detail && <p className="text-xs text-slate-500">{t.detail}</p>}
              <p className="text-[11px] text-slate-300">{new Date(t.at).toLocaleString()}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
