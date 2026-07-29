import { bidBeats, type AuctionKind } from "./schemas/auctions";

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
