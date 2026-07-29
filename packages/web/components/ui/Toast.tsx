"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type Tone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

const TONE_STYLES: Record<Tone, string> = {
  success: "border-success-200 bg-success-50 text-success-800",
  error: "border-danger-200 bg-danger-50 text-danger-800",
  info: "border-slate-200 bg-white text-slate-800",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((message: string, tone: Tone = "info") => {
    const id = (nextId.current += 1);
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto animate-toast-in rounded-lg border px-4 py-2 text-sm shadow-card-hover",
              TONE_STYLES[t.tone]
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
