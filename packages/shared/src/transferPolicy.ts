/**
 * Limits on user-to-user value transfer — CR-002.
 *
 * `transferCredits` moved stored value between two accounts on the strength of an
 * email address: no identity check, no cap, no velocity limit. Person-to-person
 * value transfer without those controls is the first pattern an AML reviewer looks
 * for, and it was live.
 *
 * The thresholds below are **defaults, not a determination**. Picking the real
 * numbers is a business and legal decision (see docs/COMPLIANCE.md); what code can
 * do is make the controls exist, bound the exposure meanwhile, and put the numbers
 * in one testable place instead of nowhere.
 *
 * Deliberately expressed in HOURS rather than money: hours are what the ledger
 * moves, and converting to money at transfer time would price off a market value
 * that drifts, making the limit mean something different each day.
 */

/** Above this in a single transfer, the sender must be identity-verified. */
export const TRANSFER_VERIFICATION_THRESHOLD_HOURS = 20;

/** Maximum hours one account may send in a rolling 24 hours. */
export const TRANSFER_DAILY_LIMIT_HOURS = 50;

/** Maximum number of transfers one account may send in a rolling 24 hours. */
export const TRANSFER_DAILY_COUNT_LIMIT = 10;

/** Window the two daily limits are measured over. */
export const TRANSFER_WINDOW_MS = 24 * 60 * 60 * 1000;

export type TransferRefusal =
  | "VERIFICATION_REQUIRED"
  | "DAILY_HOURS_EXCEEDED"
  | "DAILY_COUNT_EXCEEDED";

export interface TransferPolicyInput {
  hours: number;
  /** Sender's identity state. Only VERIFIED clears the threshold. */
  senderVerification: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  /** Hours already sent by this account inside the window. */
  hoursSentInWindow: number;
  /** Transfers already sent by this account inside the window. */
  transfersInWindow: number;
}

export interface TransferPolicyResult {
  allowed: boolean;
  refusal: TransferRefusal | null;
  /** Message safe to show the sender: states the limit, never another user's data. */
  message: string | null;
}

/**
 * Decides whether one transfer may proceed.
 *
 * Order matters and is deliberate: identity is checked before volume, so a large
 * unverified transfer is told to verify rather than told it is over a daily limit
 * it has not reached. Refusing for the wrong reason teaches users to work around
 * the wrong control.
 */
export function evaluateTransfer(input: TransferPolicyInput): TransferPolicyResult {
  const { hours, senderVerification, hoursSentInWindow, transfersInWindow } = input;

  if (hours > TRANSFER_VERIFICATION_THRESHOLD_HOURS && senderVerification !== "VERIFIED") {
    return {
      allowed: false,
      refusal: "VERIFICATION_REQUIRED",
      message: `Transfers over ${TRANSFER_VERIFICATION_THRESHOLD_HOURS}h need a verified account. Verify your identity, or send ${TRANSFER_VERIFICATION_THRESHOLD_HOURS}h or less.`,
    };
  }

  if (transfersInWindow >= TRANSFER_DAILY_COUNT_LIMIT) {
    return {
      allowed: false,
      refusal: "DAILY_COUNT_EXCEEDED",
      message: `You've reached the limit of ${TRANSFER_DAILY_COUNT_LIMIT} transfers in 24 hours. Try again later.`,
    };
  }

  if (hoursSentInWindow + hours > TRANSFER_DAILY_LIMIT_HOURS) {
    const remaining = Math.max(0, TRANSFER_DAILY_LIMIT_HOURS - hoursSentInWindow);
    return {
      allowed: false,
      refusal: "DAILY_HOURS_EXCEEDED",
      message: `That would exceed the ${TRANSFER_DAILY_LIMIT_HOURS}h you can send in 24 hours. You have ${remaining}h left today.`,
    };
  }

  return { allowed: true, refusal: null, message: null };
}
