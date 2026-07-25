import { cn } from "../../lib/cn";

/** Horizontal progress stepper (e.g. Book → Pay → Confirmed). */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Progress">
      {steps.map((step, i) => {
        const state = i < current ? "done" : i === current ? "active" : "upcoming";
        return (
          <li key={step} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                state === "done" && "bg-brand-600 text-white",
                state === "active" && "bg-brand-600 text-white ring-4 ring-brand-100",
                state === "upcoming" && "bg-slate-200 text-slate-500"
              )}
              aria-current={state === "active" ? "step" : undefined}
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                state === "upcoming" ? "text-slate-400" : "text-slate-700"
              )}
            >
              {step}
            </span>
            {i < steps.length - 1 && (
              <span className={cn("h-px flex-1", i < current ? "bg-brand-500" : "bg-slate-200")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
