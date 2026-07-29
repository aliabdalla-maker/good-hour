/**
 * What a time credit is worth when it is redeemed.
 *
 * Extracted from the credits service because the original version shipped a 37.5%
 * arbitrage *with a code comment defending the design*. Buy hours at a category's
 * average rate, redeem them against the dearest room in that category, and the
 * platform covers the gap out of a liability it only collected the average for.
 *
 * A confabulated rationale is worse than a silent bug: it inoculates the next
 * reader against noticing. So the cap now lives in a pure function whose tests
 * assert the invariant directly, rather than in prose asserting it is fine.
 */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The lower of "what the buyer paid for" and "what they are drawing down".
 *
 * `hourlyRate` is the rate of the specific unit being booked; `unitValue` is the
 * average rate the holder actually acquired credits at. Taking the minimum keeps
 * a credit worth an hour of typical inventory — the honest promise — without
 * letting it mint value on the most expensive listing in the category.
 */
export function redemptionValue(hours: number, hourlyRate: number, unitValue: number): number {
  if (hours <= 0) return 0;
  return Math.min(round2(hours * hourlyRate), round2(hours * unitValue));
}
