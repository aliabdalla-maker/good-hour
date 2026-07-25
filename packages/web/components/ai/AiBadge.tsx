import { cn } from "../../lib/cn";

/** Small "AI" marker used to label anything an agent produced. */
export function AiBadge({ label = "AI", className }: { label?: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-ai-50 px-2 py-0.5 text-xs font-semibold text-ai-700",
        className
      )}
    >
      <span aria-hidden="true">✦</span>
      {label}
    </span>
  );
}

/** Confidence as filled dots (low=1, medium=2, high=3) — no color-only meaning. */
export function ConfidenceMeter({ level }: { level: "low" | "medium" | "high" }) {
  const filled = level === "high" ? 3 : level === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1" title={`${level} confidence`}>
      <span className="flex gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={cn("h-1.5 w-1.5 rounded-full", i < filled ? "bg-ai-600" : "bg-ai-200")}
          />
        ))}
      </span>
      <span className="text-xs capitalize text-ai-700">{level} confidence</span>
    </span>
  );
}
