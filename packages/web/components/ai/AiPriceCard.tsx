"use client";

import { useState } from "react";
import type { PricingDecision } from "@gihtcx/shared";
import { AiBadge, ConfidenceMeter } from "./AiBadge";

/**
 * The AI-transparency price component: shows the agent's recommended rate, the
 * delta vs the host's base rate, a visual confidence meter, and an expandable
 * "why" with the agent's own reasoning. Makes the autonomous pricing decision
 * legible and trustworthy rather than a silent number.
 */
export function AiPriceCard({
  currency,
  baseRate,
  decision,
}: {
  currency: string;
  baseRate: number;
  decision: PricingDecision;
}) {
  const [open, setOpen] = useState(false);
  const delta = decision.recommendedHourlyRate - baseRate;
  const deltaPct = baseRate > 0 ? Math.round((delta / baseRate) * 100) : 0;
  const direction = delta > 0 ? "above" : delta < 0 ? "below" : "at";

  return (
    <div className="rounded-xl border border-ai-200 bg-ai-50/60 p-4">
      <div className="flex items-center justify-between">
        <AiBadge label="AI-optimised price" />
        <ConfidenceMeter level={decision.confidence} />
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-ai-800">
          {currency} {decision.recommendedHourlyRate.toFixed(2)}
          <span className="text-sm font-normal text-ai-600">/hr</span>
        </span>
        {delta !== 0 && (
          <span className="text-xs font-medium text-ai-700">
            {deltaPct > 0 ? "+" : ""}
            {deltaPct}% {direction} host rate ({currency} {baseRate.toFixed(2)})
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-2 text-xs font-medium text-ai-700 underline-offset-2 hover:underline"
        aria-expanded={open}
      >
        {open ? "Hide reasoning" : "Why this price?"}
      </button>
      {open && (
        <p className="mt-2 animate-fade-in rounded-lg bg-white/70 p-2 text-xs text-slate-600">
          {decision.reasoning}
        </p>
      )}
    </div>
  );
}
