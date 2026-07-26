"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationPublic } from "@gihtcx/shared";
import { api } from "../../lib/apiClient";

interface Preferences {
  marketingOptIn: boolean;
  phone: string | null;
}

import { RequireAuth } from "../../components/RequireAuth";

export default function NotificationsPage() {
  return (
    <RequireAuth>
      <NotificationsPageInner />
    </RequireAuth>
  );
}

function NotificationsPageInner() {
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const { data: notifications } = useQuery<NotificationPublic[]>({
    queryKey: ["notifications"],
    queryFn: () => api.get<NotificationPublic[]>("/notifications"),
    refetchInterval: 5000,
  });

  const { data: prefs } = useQuery<Preferences>({
    queryKey: ["notification-prefs"],
    queryFn: async () => {
      const p = await api.get<Preferences>("/notifications/preferences");
      setPhone(p.phone ?? "");
      return p;
    },
  });

  async function markAllRead() {
    await api.post("/notifications/read-all");
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function savePrefs(marketingOptIn: boolean) {
    const updated = await api.patch<Preferences>("/notifications/preferences", {
      marketingOptIn,
      phone: phone || null,
    });
    queryClient.setQueryData(["notification-prefs"], updated);
    setSavedNote("Preferences saved.");
    setTimeout(() => setSavedNote(null), 2500);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <button onClick={markAllRead} className="text-sm text-slate-500 hover:text-slate-900">
          Mark all read
        </button>
      </div>

      <section className="mb-6 rounded border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-medium">Communication preferences</h2>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={prefs?.marketingOptIn ?? true}
            onChange={(e) => savePrefs(e.target.checked)}
          />
          Receive marketing emails about Good Hours services and offers
        </label>
        <label className="mt-3 flex flex-col gap-1 text-sm">
          Mobile number for SMS alerts (optional)
          <div className="flex gap-2">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+44…"
              className="w-48 rounded border border-slate-300 px-2 py-1"
            />
            <button
              onClick={() => savePrefs(prefs?.marketingOptIn ?? true)}
              className="rounded bg-slate-900 px-3 py-1 text-sm text-white"
            >
              Save
            </button>
          </div>
        </label>
        {savedNote && <p className="mt-2 text-xs text-emerald-600">{savedNote}</p>}
      </section>

      <div className="flex flex-col gap-2">
        {notifications?.map((n) => (
          <div
            key={n.id}
            className={`rounded border p-3 ${n.readAt ? "border-slate-200 bg-white" : "border-slate-300 bg-slate-50"}`}
          >
            <div className="flex items-center justify-between">
              <p className="font-medium">{n.subject}</p>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase text-slate-500">
                {n.category === "MARKETING" ? "Marketing" : "Update"}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">{n.body}</p>
            <p className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
          </div>
        ))}
        {notifications && notifications.length === 0 && (
          <p className="text-slate-500">No notifications yet.</p>
        )}
      </div>
    </div>
  );
}
