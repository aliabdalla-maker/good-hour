/**
 * Service-level objectives and latency budgets — NFR-005, NFR-006.
 *
 * Both requirements were open for the same reason: nothing had ever been stated.
 * "Ready to live" implies an availability target and a latency expectation, but
 * neither was written down, so neither could be missed. An unstated SLO is not a
 * lenient SLO — it is an unfalsifiable one.
 *
 * Numbers below are **proposals**, deliberately achievable for a single-region
 * two-process deployment rather than aspirational. A budget nobody can hit gets
 * ignored, which is worse than a modest one that holds.
 */

/** Availability target over a rolling 30 days. */
export const AVAILABILITY_SLO = 0.995;

/** Error budget in minutes per 30 days, derived rather than typed. */
export const ERROR_BUDGET_MINUTES_PER_30D = Math.round((1 - AVAILABILITY_SLO) * 30 * 24 * 60);

/** How often the external probe checks liveness. */
export const UPTIME_PROBE_INTERVAL_MINUTES = 10;

/**
 * Consecutive probe failures before a human is told.
 *
 * Two, not one: a single failed probe is as likely to be the prober's network as
 * the service, and an alert that cries wolf is an alert that gets muted — which
 * costs more availability than the outage it was meant to catch.
 */
export const UPTIME_ALERT_AFTER_FAILURES = 2;

/**
 * p95 latency budgets in milliseconds, by operation class.
 *
 * Measured server-side against a warm database. They exclude network transit,
 * because that is the one part the code cannot influence — a budget that moves
 * with the tester's wifi is not a budget.
 */
export const LATENCY_BUDGETS_MS = {
  /** A single indexed row: health, session check, one listing. */
  point_read: 150,
  /** A filtered list with a bounded result set: search, browse, my orders. */
  list_read: 600,
  /** A transactional write: place order, apply ledger writes, place bid. */
  transactional_write: 900,
  /** Anything that calls a model. Bounded by the agent's own 5s timeout. */
  agent_call: 5000,
} as const;

export type LatencyClass = keyof typeof LATENCY_BUDGETS_MS;

export interface LatencyResult {
  operation: string;
  class: LatencyClass;
  observedMs: number;
  budgetMs: number;
  withinBudget: boolean;
}

export function checkLatency(
  operation: string,
  latencyClass: LatencyClass,
  observedMs: number
): LatencyResult {
  const budgetMs = LATENCY_BUDGETS_MS[latencyClass];
  return {
    operation,
    class: latencyClass,
    observedMs: Math.round(observedMs),
    budgetMs,
    withinBudget: observedMs <= budgetMs,
  };
}

/**
 * p95 of a sample, using the nearest-rank method.
 *
 * Not a mean: an average hides exactly the tail the budget exists to bound. With
 * fewer than 20 samples p95 is really "the worst one", which is stated here rather
 * than dressed up as a percentile.
 */
export function p95(samplesMs: number[]): number {
  if (samplesMs.length === 0) return 0;
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const rank = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, rank)]!;
}
