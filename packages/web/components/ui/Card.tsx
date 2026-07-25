import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-slate-200 bg-white shadow-card", className)}
      {...props}
    />
  );
}

/** A card that behaves as a link target — adds hover elevation. */
export function InteractiveCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white shadow-card transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-card-hover",
        className
      )}
      {...props}
    />
  );
}
