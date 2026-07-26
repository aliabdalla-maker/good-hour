"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MessagePublic } from "@gihtcx/shared";
import { api, ApiError } from "../lib/apiClient";

export function MessageThread({ bookingId }: { bookingId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-slate-700 underline"
      >
        {open ? "Hide messages" : "Message host"}
      </button>
      {open && <Thread bookingId={bookingId} />}
    </div>
  );
}

function Thread({ bookingId }: { bookingId: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: messages } = useQuery<MessagePublic[]>({
    queryKey: ["messages", bookingId],
    queryFn: () => api.get<MessagePublic[]>(`/messages?bookingId=${bookingId}`),
    refetchInterval: 8000, // light polling so replies show up
  });

  const send = useMutation({
    mutationFn: () => api.post<MessagePublic>("/messages", { bookingId, body }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: ["messages", bookingId] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Could not send"),
  });

  return (
    <div className="mt-2">
      <div className="max-h-52 space-y-2 overflow-y-auto rounded bg-slate-50 p-2">
        {messages?.length ? (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm ${
                  m.mine ? "bg-brand-500 text-white" : "bg-white text-slate-700 border border-slate-200"
                }`}
              >
                <p>{m.body}</p>
                <p className={`mt-0.5 text-[10px] ${m.mine ? "text-white/70" : "text-slate-400"}`}>
                  {m.senderRole} · {new Date(m.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-slate-400">No messages yet. Say hello to coordinate your booking.</p>
        )}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (body.trim()) send.mutate();
        }}
        className="mt-2 flex gap-2"
      >
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message…"
          maxLength={2000}
          className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-sm"
        />
        <button
          type="submit"
          disabled={send.isPending || !body.trim()}
          className="rounded bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-60"
        >
          Send
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
