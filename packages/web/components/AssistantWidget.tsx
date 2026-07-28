"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AssistantAction, AssistantReply } from "@gihtcx/shared";
import { api } from "../lib/apiClient";

type ChatMessage = { role: "user" | "assistant"; content: string; actions?: AssistantAction[] };

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm your Good Hours concierge ✦ — I can help you find rooms, cars or travel by the hour, or list your own. What are you after?",
};

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [maximised, setMaximised] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    const history = [...messages, { role: "user" as const, content: question }];
    setMessages(history);
    setInput("");
    setLoading(true);
    try {
      const payload = history
        .filter((m) => m !== GREETING)
        .map((m) => ({ role: m.role, content: m.content }));
      const res = await api.post<AssistantReply>("/assistant/chat", {
        messages: payload,
        pageContext: pathname,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply, actions: res.actions }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry — I couldn't reach the assistant just now. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function go(action: AssistantAction) {
    if (action.type === "propose_booking") {
      const params = new URLSearchParams({ startsAt: action.startsAt, endsAt: action.endsAt });
      router.push(`/room/${action.roomId}?${params.toString()}`);
    } else {
      router.push(action.path);
    }
    setMaximised(false);
  }

  // Collapsed launcher
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open the Good Hours assistant"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white shadow-card-hover transition-transform hover:scale-105 animate-scale-in"
        style={{ backgroundImage: "linear-gradient(135deg,#0f766e,#115e59 55%,#6d28d9)" }}
      >
        ✦
      </button>
    );
  }

  return (
    <div
      className={`fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card-hover animate-scale-in ${
        maximised ? "inset-3 sm:inset-6" : "bottom-5 right-5 h-[32rem] w-[min(92vw,26rem)]"
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 text-white"
        style={{ backgroundImage: "linear-gradient(135deg,#0f766e,#115e59 55%,#6d28d9)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">✦</span>
          <div>
            <p className="text-sm font-semibold leading-none">Good Hours assistant</p>
            <p className="mt-0.5 text-[11px] text-white/75">AI concierge · rooms, cars &amp; travel</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMaximised((m) => !m)}
            aria-label={maximised ? "Restore" : "Maximise"}
            className="rounded-md px-2 py-1 text-sm hover:bg-white/15"
          >
            {maximised ? "🗗" : "🗖"}
          </button>
          <button onClick={() => setOpen(false)} aria-label="Close" className="rounded-md px-2 py-1 text-sm hover:bg-white/15">
            ✕
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                m.role === "user" ? "bg-brand-700 text-white" : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.actions && m.actions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.actions.map((a, j) => (
                    <button
                      key={j}
                      onClick={() => go(a)}
                      className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100"
                    >
                      {a.label} →
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">Thinking…</div>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2 border-t border-slate-100 p-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything… e.g. cars in London"
          className="min-w-0 flex-1 rounded-full border border-slate-200 px-3 py-2 text-sm focus:border-brand-400"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-full bg-brand-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
