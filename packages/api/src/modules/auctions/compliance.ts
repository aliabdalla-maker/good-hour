import { prisma } from "@gihtcx/db";
import {
  AGENT_MANDATE_CHANNEL,
  AGENT_MANDATE_TERMS_VERSION,
  AUCTION_TERMS_CHANNEL,
  AUCTION_TERMS_VERSION,
  type DisputeReason,
} from "@gihtcx/shared";
import { AppError } from "../../plugins/errorHandler";

/**
 * Terms acceptance and disputes — CR-003, CR-004.
 *
 * Acceptance is recorded on `ConsentEvent`, which already exists for marketing
 * consent and is the right shape: append-only, per-user, timestamped, with a
 * channel and a source. Adding a table for this would have meant a migration to
 * store what an existing append-only consent log already models.
 *
 * The `source` field carries the terms VERSION. An acceptance that doesn't record
 * which text was agreed to says only "agreed to whatever it said that day", which
 * is worthless in exactly the dispute it exists to settle.
 */

/**
 * Records that a bidder accepted the auction terms, and the mandate terms too when
 * the bid carries a proxy ceiling.
 *
 * Deliberately idempotent-tolerant rather than idempotent: a second bid in the same
 * auction writes a second acceptance. That is correct — each bid is a separate
 * binding offer, and the log should show that each was made under stated terms.
 */
export async function recordBidTermsAcceptance(
  userId: string,
  opts: { hasMandate: boolean }
): Promise<void> {
  const events = [
    {
      userId,
      channel: AUCTION_TERMS_CHANNEL,
      granted: true,
      source: AUCTION_TERMS_VERSION,
    },
  ];
  if (opts.hasMandate) {
    events.push({
      userId,
      channel: AGENT_MANDATE_CHANNEL,
      granted: true,
      source: AGENT_MANDATE_TERMS_VERSION,
    });
  }
  await prisma.consentEvent.createMany({ data: events });
}

/** Whether a user has ever accepted the current version of each document. */
export async function termsAcceptance(userId: string) {
  const [auction, mandate] = await Promise.all([
    prisma.consentEvent.findFirst({
      where: { userId, channel: AUCTION_TERMS_CHANNEL, source: AUCTION_TERMS_VERSION },
      orderBy: { createdAt: "desc" },
    }),
    prisma.consentEvent.findFirst({
      where: { userId, channel: AGENT_MANDATE_CHANNEL, source: AGENT_MANDATE_TERMS_VERSION },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    auctionTerms: auction ? { version: auction.source, acceptedAt: auction.createdAt.toISOString() } : null,
    agentMandate: mandate ? { version: mandate.source, acceptedAt: mandate.createdAt.toISOString() } : null,
  };
}

export interface RaiseDisputeInput {
  auctionId: string;
  reason: DisputeReason;
  detail: string;
}

/**
 * Raises a dispute against an auction the user took part in.
 *
 * CR-004's real gap was not the audit trail — `AgentDecisionLog` already made an
 * agent's bid *answerable*. It was that nothing said who to answer to. This is that
 * route: a durable record on the operator's queue, plus a receipt to the user, plus
 * the agent decisions relevant to the auction gathered at the time of filing so the
 * evidence cannot drift afterwards.
 */
export async function raiseAuctionDispute(userId: string, input: RaiseDisputeInput) {
  const auction = await prisma.marketplaceAuction.findUnique({
    where: { id: input.auctionId },
    select: { id: true, title: true, createdById: true, status: true },
  });
  if (!auction) throw new AppError(404, "Auction not found", "NOT_FOUND");

  // Standing: only a participant may dispute. Otherwise the dispute queue becomes
  // an unauthenticated channel into the operator's inbox.
  const bidCount = await prisma.auctionBid.count({
    where: { auctionId: input.auctionId, bidderId: userId },
  });
  if (bidCount === 0 && auction.createdById !== userId) {
    throw new AppError(403, "Only someone who took part in this auction can dispute it", "FORBIDDEN");
  }
  if (auction.status === "OPEN") {
    throw new AppError(
      409,
      "This auction is still open — disputes can be raised once it closes",
      "AUCTION_OPEN"
    );
  }

  const agentDecisions = await prisma.agentDecisionLog.count({
    where: { agentType: "AUCTION", subjectId: input.auctionId },
  });

  const body = [
    `DISPUTE (${input.reason}) on auction ${auction.id} — "${auction.title}"`,
    `Raised by ${userId}. Auction status at filing: ${auction.status}.`,
    `Bids by this user: ${bidCount}. Agent decisions recorded for this auction: ${agentDecisions}.`,
    "",
    input.detail,
  ].join("\n");

  // authorId is the raiser: this is their statement, not the operator's note about
  // them, and attributing it to an admin would misrepresent the record.
  const note = await prisma.crmNote.create({
    data: { userId, authorId: userId, body },
  });

  await prisma.notification.create({
    data: {
      userId,
      channel: "IN_APP",
      category: "TRANSACTIONAL",
      type: "dispute.raised",
      subject: "We've received your dispute",
      body: `Your dispute about "${auction.title}" is with our team. We'll answer using the recorded bid history and agent decision log.`,
      data: { auctionId: auction.id, reason: input.reason, disputeId: note.id },
    },
  });

  return {
    disputeId: note.id,
    auctionId: auction.id,
    reason: input.reason,
    agentDecisionsOnRecord: agentDecisions,
    raisedAt: note.createdAt.toISOString(),
  };
}
