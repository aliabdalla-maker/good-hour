/**
 * Binding terms for the two places this platform commits a user to something —
 * CR-003 (auction finality) and CR-004 (autonomous agent mandates).
 *
 * These were the compliance gaps that no code change could fix on its own: the
 * platform created binding obligations while stating no terms for them. A winning
 * bid was final with nothing saying so, and an agent could commit a user to spend
 * with nothing saying whether the user was bound or how to dispute it.
 *
 * Terms are **versioned** and acceptance records the version. Without that, an
 * acceptance says only "agreed to whatever the text happened to say that day",
 * which is worth nothing in the dispute it exists to resolve.
 *
 * This is drafting by an engineer, not by a lawyer. It is written to be reviewed
 * and replaced — but stating clear terms badly is recoverable, and stating none at
 * all is not.
 */

export const AUCTION_TERMS_VERSION = "auction-terms-2026-07";
export const AGENT_MANDATE_TERMS_VERSION = "agent-mandate-2026-07";

/** Consent channels these acceptances are recorded under. */
export const AUCTION_TERMS_CHANNEL = "auction_terms";
export const AGENT_MANDATE_CHANNEL = "agent_mandate";

export interface TermsDocument {
  version: string;
  title: string;
  /** Short enough to read before clicking. Long terms are unread terms. */
  summary: string;
  clauses: string[];
}

export const AUCTION_TERMS: TermsDocument = {
  version: AUCTION_TERMS_VERSION,
  title: "Auction terms",
  summary:
    "A bid is an offer you cannot withdraw. If you hold the leading bid when the auction closes above its reserve, you are committed to the trade.",
  clauses: [
    "Placing a bid is a binding offer. Bids cannot be withdrawn or lowered once placed.",
    "If your bid is leading when the auction closes, and it meets the reserve, you are the winner and are committed to completing the trade at that price plus the buyer fee.",
    "The winner has 24 hours to settle. Settling requires sufficient funds in your wallet at the time of settlement.",
    "If an auction closes without a bid that meets the reserve, no trade occurs and nobody is committed.",
    "Because an auction is a competitive sale, there is no cooling-off period after a winning bid. This is different from an ordinary purchase, and is the reason a bid asks you to confirm these terms.",
    "The platform may cancel an auction and reverse any settlement where there is evidence of manipulation, including bidding on your own listing through another account.",
    "If you believe an auction outcome is wrong, you can raise a dispute against it. Disputes are answered using the recorded bid history.",
  ],
};

export const AGENT_MANDATE_TERMS: TermsDocument = {
  version: AGENT_MANDATE_TERMS_VERSION,
  title: "Agent bidding mandate",
  summary:
    "You set a ceiling; the agent bids up to it on your behalf. Bids it places bind you exactly as your own do. It never bids above your ceiling, and never more than it needs to lead.",
  clauses: [
    "A mandate authorises the platform's agent to place bids on your behalf up to the ceiling you set, and only in the auction you set it for.",
    "Bids placed by your agent bind you in exactly the same way as bids you place yourself.",
    "The agent will never bid above your ceiling, and never more than one increment beyond the next-strongest competing mandate. It cannot spend your ceiling merely because it has it.",
    "Automatic settlement is off unless you explicitly turn it on for that bid. With it off, winning still requires you to settle.",
    "Every decision the agent makes is recorded with the information it had, the model used and the price it chose. You can request that record.",
    "You can withdraw a mandate at any time before the auction closes. Bids already placed stand.",
    "If you believe the agent acted outside this mandate, raise a dispute. The recorded decision log is the evidence, and where the record shows the agent exceeded the mandate the trade is reversed.",
  ],
};

export const DISPUTE_REASONS = [
  "AGENT_EXCEEDED_MANDATE",
  "AUCTION_MANIPULATION",
  "ITEM_NOT_AS_DESCRIBED",
  "NOT_DELIVERED",
  "OTHER",
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  AGENT_EXCEEDED_MANDATE: "My agent bid outside the mandate I set",
  AUCTION_MANIPULATION: "I think the bidding was manipulated",
  ITEM_NOT_AS_DESCRIBED: "What I received wasn't what was described",
  NOT_DELIVERED: "The seller never delivered",
  OTHER: "Something else",
};
