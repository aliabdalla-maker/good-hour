import { bidBeats, nextValidBid, type AuctionKind } from "./schemas/auctions";

/**
 * Proxy-auction resolution, extracted from the auctions service so it can be
 * tested without a database.
 *
 * It lives here because of a specific bug: the first implementation looped
 * "everybody counters by one increment" up to a fixed round cap. With a £0.50
 * increment and ceilings of £70 and £62 the ladder crawled 50 → 55 → 55.50 → …
 * and stopped at the cap with the £62 mandate in front. The *iteration limit*
 * was choosing the winner instead of the mandates.
 *
 * That bug was reachable only through Prisma, so nothing tested it, and the code
 * carried a comment describing it as proxy bidding — right vocabulary, different
 * algorithm. Pulling the decision into a pure function is what makes the
 * regression test below possible at all.
 */

export interface ProxyMandate {
  bidderId: string;
  maxPerHour: number;
  autoSettle?: boolean;
}

export interface ProxyContestInput {
  kind: AuctionKind;
  /** Who currently holds the lead, and at what price. */
  leadingBidderId: string;
  leadingPerHour: number;
  /** One mandate per bidder — the caller de-duplicates to the latest. */
  mandates: ProxyMandate[];
}

export interface ProxyContestOutcome {
  /** The mandate that must end up in front. */
  championId: string;
  championCeiling: number;
  championAutoSettle: boolean;
  /**
   * The price the champion has to beat: the runner-up's ceiling when one can
   * reach it, otherwise the live lead. The agent then bids one increment past
   * this, clamped to `championCeiling`.
   */
  referencePerHour: number;
}

/**
 * Returns the contest outcome, or `null` when no bid should be placed.
 *
 * The invariant that the looping version violated: **a strictly stronger ceiling
 * always ends up in front**, whatever the increment and however many bidders are
 * involved. "Stronger" means higher in a FORWARD auction and lower in a REVERSE
 * one, which is the only place `kind` matters here.
 */
export function resolveProxyContest(input: ProxyContestInput): ProxyContestOutcome | null {
  const { kind, leadingBidderId, leadingPerHour, mandates } = input;
  if (mandates.length === 0) return null;

  const strongerFirst = [...mandates].sort((x, y) =>
    kind === "FORWARD" ? y.maxPerHour - x.maxPerHour : x.maxPerHour - y.maxPerHour
  );
  const champion = strongerFirst[0]!;
  const runnerUp = strongerFirst[1];

  // The strongest mandate already leads and no rival ceiling can reach it —
  // bidding again would only be bidding against itself.
  if (champion.bidderId === leadingBidderId) {
    const rivalCanBeat =
      runnerUp !== undefined && bidBeats(kind, runnerUp.maxPerHour, leadingPerHour);
    if (!rivalCanBeat) return null;
  }

  const contested = runnerUp ? runnerUp.maxPerHour : leadingPerHour;
  const referencePerHour = bidBeats(kind, contested, leadingPerHour) ? contested : leadingPerHour;

  return {
    championId: champion.bidderId,
    championCeiling: champion.maxPerHour,
    championAutoSettle: champion.autoSettle ?? false,
    referencePerHour,
  };
}

/**
 * Clamps a proposed bid into the only range legal for this mandate.
 *
 * FORWARD: must beat the leader, must not exceed the ceiling.
 * REVERSE: must undercut the leader, must not fall below the floor.
 *
 * Runs on every path, including the model's own answer. The model is told the
 * ceiling and is never trusted to respect it — here it is spending real money.
 *
 * Moved out of the auctions module for the same reason as resolveProxyContest:
 * it was a pure function sitting behind an OpenAI call, so nothing could test the
 * one guarantee that matters — that no model output, however wrong, can bid past
 * the mandate.
 *
 * Moving it found a second defect the mandate bound was hiding. The old version
 * clamped into the legal *range* and then took the model's magnitude: told the
 * lead was £60 and the ceiling £70, a model answer of "£70" bid £70, when £60.50
 * would have taken the lead. Within mandate, and a 16% overpay — every time the
 * model felt bullish. Reverse auctions had the mirror defect: the agent would
 * undercut to £60 when £79.50 already won, giving away the seller's margin.
 *
 * So the magnitude is no longer the model's to choose. In a proxy contest any
 * amount beyond the minimum needed to lead is pure waste: it buys the same lead
 * for more money and reveals the mandate. The model decides **whether** to bid;
 * the price is deterministic. `proposed` is read only as willingness — a model
 * unwilling to reach the minimum is expressing a hold.
 *
 * This is what makes resolveProxyContest's guarantee actually pay: the winner
 * ends up one increment above the runner-up's ceiling, not at their own.
 */
export function clampToMandate(
  kind: AuctionKind,
  proposed: number,
  leadingPerHour: number | null,
  ceiling: number,
  reservePerHour: number
): number | null {
  const minimum = nextValidBid(kind, reservePerHour, leadingPerHour);

  if (kind === "FORWARD") {
    // Unwilling to reach the minimum -> hold. NaN falls through to the bid, since
    // a nonsense magnitude must not be read as a decision to withdraw.
    if (proposed < minimum) return null;
    return minimum <= ceiling && bidBeats(kind, minimum, leadingPerHour) ? minimum : null;
  }
  // REVERSE: `ceiling` is a floor — the least the seller will accept.
  if (proposed > minimum) return null;
  return minimum >= ceiling && bidBeats(kind, minimum, leadingPerHour) ? minimum : null;
}
