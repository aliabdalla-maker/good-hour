"use client";

import { useState } from "react";
import type { CampaignResult } from "@gihtcx/shared";
import { api, ApiError } from "../../../lib/apiClient";

const TEMPLATES = [
  {
    label: "Announce instant booking",
    subject: "Book a room by the hour — instantly",
    body: "Need a space for a few hours? Good Hours lets you search by city and time and book instantly, with transparent hourly pricing.",
  },
  {
    label: "Announce reverse auction",
    subject: "Let suppliers bid for your booking",
    body: "Post what you need on Good Hours and let suppliers — and their AI agents — compete with their best offers. You pick the winner.",
  },
];

import { RequireAuth } from "../../../components/RequireAuth";

export default function CampaignsPage() {
  return (
    <RequireAuth roles={["ADMIN"]}>
      <CampaignsPageInner />
    </RequireAuth>
  );
}

function CampaignsPageInner() {
  const [subject, setSubject] = useState(TEMPLATES[0].subject);
  const [body, setBody] = useState(TEMPLATES[0].body);
  const [audience, setAudience] = useState<"ALL" | "TRAVELLER" | "SUPPLIER">("ALL");
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const res = await api.post<CampaignResult>("/notifications/campaigns", { subject, body, audience });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send campaign");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display mb-1 text-2xl font-semibold">Marketing campaigns</h1>
      <p className="mb-6 text-sm text-slate-500">
        Announce platform services to travellers and suppliers. Emails only go to users who have opted in;
        everyone still sees it in their in-app feed. (Admin only.)
      </p>

      <div className="mb-4 flex flex-wrap gap-2">
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            onClick={() => {
              setSubject(t.subject);
              setBody(t.body);
            }}
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:border-slate-500"
          >
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={send} className="flex flex-col gap-4 rounded border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          Audience
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as typeof audience)}
            className="rounded border border-slate-300 px-2 py-1"
          >
            <option value="ALL">Everyone</option>
            <option value="TRAVELLER">Travellers</option>
            <option value="SUPPLIER">Suppliers</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Message
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="rounded border border-slate-300 px-2 py-1" />
        </label>
        {error && <p className="text-sm text-danger-600">{error}</p>}
        <button type="submit" disabled={sending} className="self-start rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
          {sending ? "Sending…" : "Send campaign"}
        </button>
      </form>

      {result && (
        <div className="mt-4 rounded border border-success-200 bg-success-50 p-4 text-sm text-success-800">
          Sent to <strong>{result.recipients}</strong> opted-in recipient(s) ({result.audience}). Email delivery:{" "}
          <strong>{result.emailDelivery === "provider" ? "sent via provider" : "logged (no email key set)"}</strong>.
          {result.skippedOptOut > 0 && <> {result.skippedOptOut} opted out of marketing email (in-app only).</>}
        </div>
      )}
    </div>
  );
}
