import { prisma } from "@gihtcx/db";
import { randomUUID } from "node:crypto";
import type {
  AuctionDetail,
  AuctionKind,
  AuctionPublic,
  AuctionSearchQuery,
  CreateAuctionInput,
  PlaceBidInput,
} from "@gihtcx/shared";
import {
  MAX_AUCTION_DAYS,
  MIN_AUCTION_MINUTES,
  bidBeats,
  computeTradeFee,
  nextValidBid,
  resolveProxyContest,
} from "@gihtcx/shared";
import { AppError } from "../../plugins/errorHandler";
import { domainEvents } from "../../events/bus";
import { auctionCloseQueue } from "../../queue/queues";
import { applyWalletWrites, getMoneyBalance } from "../wallet";
import { decideCounterBid } from "./agent";
import { recordBidTermsAcceptance } from "./compliance";
import { recordAgentOutcome } from "../agent-log";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Masked handle, same reasoning as the marketplace: never leak an email publicly. */
function handleFrom(email: string): string {
  const local = email.split("@")[0] ?? "user";
  return local.length <= 4 ? local : `${local.slice(0, 3)}…${local.slice(-2)}`;
}

/**
 * The leading bid, which means opposite things in the two directions:
 * highest per-hour in a FORWARD auction, lowest in a REVERSE one.
 */
async function leadingBid(auctionId: string, kind: AuctionKind) {
  return prisma.auctionBid.findFirst({
    where: { auctionId, status: { in: ["ACTIVE"] } },
    orderBy: { amountPerHour: kind === "FORWARD" ? "desc" : "asc" },
  });
}

export async function createAuction(userId: string, input: CreateAuctionInput): Promise<AuctionPublic> {
  const closesAt = new Date(input.closesAt);
  const minutes = (closesAt.getTime() - Date.now()) / 60_000;
  if (minutes < MIN_AUCTION_MINUTES) {
    throw new AppError(400, `An auction must run for at least ${MIN_AUCTION_MINUTES} minutes`, "TOO_SHORT");
  }
  if (minutes > MAX_AUCTION_DAYS * 24 * 60) {
    throw new AppError(400, `An auction can't run longer than ${MAX_AUCTION_DAYS} days`, "TOO_LONG");
  }

  if (input.listingId) {
    const listing = await prisma.marketplaceListing.findUnique({ where: { id: input.listingId } });
    if (!listing || listing.sellerId !== userId) {
      throw new AppError(404, "Listing not found", "NOT_FOUND");
    }
  }

  const auction = await prisma.marketplaceAuction.create({
    data: {
      kind: input.kind,
      createdById: userId,
      listingId: input.listingId ?? null,
      title: input.title,
      description: input.description,
      category: input.category.trim().toLowerCase(),
      hours: input.hours,
      reservePerHour: input.reservePerHour,
      closesAt,
    },
  });

  // Delayed job closes it on the clock. jobId keyed on the auction so
  // re-enqueuing is idempotent, same pattern as booking expiry.
  await auctionCloseQueue.add(
    "close",
    { auctionId: auction.id },
    {
      delay: Math.max(0, closesAt.getTime() - Date.now()),
      jobId: `auction-close-${auction.id}`,
      removeOnComplete: true,
      removeOnFail: true,
    }
  );

  await domainEvents.publish({
    type: "auction.opened",
    payload: { auctionId: auction.id, kind: auction.kind, createdById: userId },
  });

  return toPublicAuction(auction, 0, null, userId);
}

type AuctionRow = Awaited<ReturnType<typeof prisma.marketplaceAuction.findFirstOrThrow>>;

function toPublicAuction(
  a: AuctionRow,
  bidCount: number,
  leading: { amountPerHour: unknown; totalAmount: unknown; bidderId: string } | null,
  viewerId: string | null,
  createdByHandle = "-"
): AuctionPublic {
  const leadingPerHour = leading ? Number(leading.amountPerHour) : null;
  return {
    id: a.id,
    kind: a.kind,
    createdById: a.createdById,
    createdByHandle,
    listingId: a.listingId,
    title: a.title,
    description: a.description,
    category: a.category,
    hours: Number(a.hours),
    reservePerHour: Number(a.reservePerHour),
    currency: a.currency,
    closesAt: a.closesAt.toISOString(),
    status: a.status,
    bidCount,
    leadingPerHour,
    leadingTotal: leading ? Number(leading.totalAmount) : null,
    viewerIsLeading: Boolean(viewerId && leading && leading.bidderId === viewerId),
    nextValidPerHour: nextValidBid(a.kind, Number(a.reservePerHour), leadingPerHour),
    winningBidId: a.winningBidId,
    createdAt: a.createdAt.toISOString(),
  };
}

export async function searchAuctions(
  query: AuctionSearchQuery,
  viewerId: string | null
): Promise<AuctionPublic[]> {
  const where: Record<string, unknown> = {};
  if (query.kind) where.kind = query.kind;
  if (query.status) where.status = query.status;
  else where.status = "OPEN";
  if (query.category) where.category = query.category.trim().toLowerCase();
  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: "insensitive" } },
      { description: { contains: query.q, mode: "insensitive" } },
      { category: { contains: query.q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.marketplaceAuction.findMany({
    where,
    orderBy: { closesAt: "asc" },
    take: 60,
    include: {
      createdBy: { select: { email: true } },
      bids: { where: { status: "ACTIVE" }, select: { amountPerHour: true, totalAmount: true, bidderId: true } },
    },
  });

  return rows.map((r) => {
    const sorted = [...r.bids].sort((x, y) =>
      r.kind === "FORWARD"
        ? Number(y.amountPerHour) - Number(x.amountPerHour)
        : Number(x.amountPerHour) - Number(y.amountPerHour)
    );
    return toPublicAuction(r, r.bids.length, sorted[0] ?? null, viewerId, handleFrom(r.createdBy.email));
  });
}

export async function getAuctionDetail(id: string, viewerId: string | null): Promise<AuctionDetail> {
  const a = await prisma.marketplaceAuction.findUnique({
    where: { id },
    include: { createdBy: { select: { email: true } } },
  });
  if (!a) throw new AppError(404, "Auction not found", "NOT_FOUND");

  const bids = await prisma.auctionBid.findMany({
    where: { auctionId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { bidder: { select: { email: true } } },
  });

  const active = bids.filter((b) => b.status === "ACTIVE");
  const sorted = [...active].sort((x, y) =>
    a.kind === "FORWARD"
      ? Number(y.amountPerHour) - Number(x.amountPerHour)
      : Number(x.amountPerHour) - Number(y.amountPerHour)
  );
  const leading = sorted[0] ?? null;
  const auction = toPublicAuction(a, active.length, leading, viewerId, handleFrom(a.createdBy.email));

  const fee = leading ? computeTradeFee(Number(leading.totalAmount)) : null;

  return {
    auction,
    bids: bids.map((b) => ({
      id: b.id,
      bidderId: b.bidderId,
      bidderHandle: handleFrom(b.bidder.email),
      amountPerHour: Number(b.amountPerHour),
      totalAmount: Number(b.totalAmount),
      isAgentPlaced: b.isAgentPlaced,
      // A rival's proxy ceiling is their private strategy — only ever surface
      // the existence of a ceiling on the viewer's own bids.
      hasProxyCeiling: b.bidderId === viewerId ? b.maxPerHour !== null : false,
      autoSettle: b.bidderId === viewerId ? b.autoSettle : false,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
    })),
    feePreview: fee
      ? {
          subtotal: fee.subtotal,
          buyerFee: fee.buyerFee,
          buyerTotal: fee.buyerTotal,
          sellerFee: fee.sellerFee,
          sellerProceeds: fee.sellerProceeds,
        }
      : null,
  };
}

/**
 * Places a bid, then lets every rival agent respond.
 *
 * The response step is what makes this agent-to-agent commerce rather than a
 * click-war: any outbid participant who left a proxy ceiling gets their agent
 * consulted, and the loop continues until nobody's mandate can improve on the
 * lead. `maxRounds` bounds it so two aggressive mandates can't ping-pong
 * forever.
 */
export async function placeBid(bidderId: string, auctionId: string, input: PlaceBidInput) {
  const auction = await prisma.marketplaceAuction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new AppError(404, "Auction not found", "NOT_FOUND");
  if (auction.status !== "OPEN") throw new AppError(409, "This auction has closed", "AUCTION_CLOSED");
  if (auction.closesAt <= new Date()) throw new AppError(409, "This auction has closed", "AUCTION_CLOSED");
  if (auction.createdById === bidderId) {
    throw new AppError(400, "You can't bid on your own auction", "SELF_BID");
  }

  await recordBid(auction, bidderId, input.amountPerHour, {
    maxPerHour: input.maxPerHour,
    autoSettle: input.autoSettle,
    isAgentPlaced: false,
  });

  // CR-003 / CR-004. Recorded AFTER the bid is accepted, so a rejected bid does not
  // leave an acceptance behind for terms that never bound anything. A mandate adds a
  // second acceptance because it authorises something the bid alone does not:
  // spending on the user's behalf while they are not looking.
  await recordBidTermsAcceptance(bidderId, { hasMandate: input.maxPerHour !== undefined });

  await runAgentResponses(auctionId);
  return getAuctionDetail(auctionId, bidderId);
}

async function recordBid(
  auction: AuctionRow,
  bidderId: string,
  amountPerHour: number,
  opts: { maxPerHour?: number; autoSettle?: boolean; isAgentPlaced: boolean }
) {
  const leading = await leadingBid(auction.id, auction.kind);
  const leadingAmount = leading ? Number(leading.amountPerHour) : null;
  const reserve = Number(auction.reservePerHour);

  if (!bidBeats(auction.kind, amountPerHour, leadingAmount)) {
    throw new AppError(
      409,
      auction.kind === "FORWARD"
        ? "Someone has already bid that much or more"
        : "Someone has already bid that low or lower",
      "BID_TOO_LOW"
    );
  }
  // The reserve is a hard gate in both directions, checked here rather than at
  // close, so a bidder learns immediately instead of losing on a technicality.
  if (auction.kind === "FORWARD" && amountPerHour < reserve) {
    throw new AppError(409, `Bids must be at least ${reserve} per hour`, "BELOW_RESERVE");
  }
  if (auction.kind === "REVERSE" && amountPerHour > reserve) {
    throw new AppError(409, `Bids must be at most ${reserve} per hour`, "ABOVE_BUDGET");
  }

  const hours = Number(auction.hours);
  const created = await prisma.$transaction(async (tx) => {
    // Everything previously ACTIVE is now beaten.
    await tx.auctionBid.updateMany({
      where: { auctionId: auction.id, status: "ACTIVE" },
      data: { status: "OUTBID" },
    });
    return tx.auctionBid.create({
      data: {
        auctionId: auction.id,
        bidderId,
        amountPerHour,
        totalAmount: round2(amountPerHour * hours),
        maxPerHour: opts.maxPerHour ?? null,
        autoSettle: opts.autoSettle ?? false,
        isAgentPlaced: opts.isAgentPlaced,
      },
    });
  });

  await domainEvents.publish({
    type: "auction.bid",
    payload: {
      auctionId: auction.id,
      bidId: created.id,
      bidderId,
      amountPerHour,
      isAgentPlaced: opts.isAgentPlaced,
    },
  });
  return created;
}

/**
 * Gives every outbid participant with a live mandate one chance to respond,
 * repeatedly, until the bidding settles.
 */
async function runAgentResponses(auctionId: string): Promise<void> {
  const auction = await prisma.marketplaceAuction.findUnique({ where: { id: auctionId } });
  if (!auction || auction.status !== "OPEN") return;

  const leading = await leadingBid(auctionId, auction.kind);
  if (!leading) return;

  // Latest mandate per bidder, including whoever currently leads — their
  // ceiling is part of the contest.
  const mandates = await prisma.auctionBid.findMany({
    where: { auctionId, maxPerHour: { not: null } },
    orderBy: { createdAt: "desc" },
    distinct: ["bidderId"],
  });

  const rivals = mandates.filter((m) => m.bidderId !== leading.bidderId);
  if (rivals.length === 0) return;

  /**
   * Resolve the proxy contest in ONE step, to its economic conclusion.
   *
   * The decision itself lives in `resolveProxyContest` (shared) rather than here,
   * because the bug it replaced was only reachable through Prisma and so nothing
   * tested it: the first version looped "everyone counters by one increment" up to
   * a fixed round cap, and with a £0.50 increment against ceilings of £70 and £62
   * the ladder ran out of rounds around £58 with the £62 mandate in front. The
   * iteration limit was picking the winner instead of the mandates.
   *
   * Pure function + regression test is the actual fix; a correct comment here was
   * never going to be one. See proxyContest.test.ts, which sweeps the ceiling gap.
   */
  const currentLead = Number(leading.amountPerHour);
  const contest = resolveProxyContest({
    kind: auction.kind,
    leadingBidderId: leading.bidderId,
    leadingPerHour: currentLead,
    mandates: mandates.map((m) => ({
      bidderId: m.bidderId,
      maxPerHour: Number(m.maxPerHour),
      autoSettle: m.autoSettle,
    })),
  });
  if (!contest) return;

  const championCeiling = contest.championCeiling;
  const reference = contest.referencePerHour;

  const decision = await decideCounterBid({
    auctionId,
    kind: auction.kind,
    title: auction.title,
    category: auction.category,
    hours: Number(auction.hours),
    reservePerHour: Number(auction.reservePerHour),
    leadingPerHour: reference,
    ceilingPerHour: championCeiling,
    bidCount: await prisma.auctionBid.count({ where: { auctionId } }),
    minutesRemaining: Math.max(0, (auction.closesAt.getTime() - Date.now()) / 60_000),
    currency: auction.currency,
  });
  if (decision.amountPerHour === null) return;
  // Never re-bid against yourself if you already lead at or beyond the target.
  if (!bidBeats(auction.kind, decision.amountPerHour, currentLead)) return;

  try {
    await recordBid(auction, contest.championId, decision.amountPerHour, {
      maxPerHour: championCeiling,
      autoSettle: contest.championAutoSettle,
      isAgentPlaced: true,
    });
  } catch {
    // Lost a race to a concurrent human bid; that bid's own resolution pass
    // will re-run this logic against the new lead.
  }
}

/**
 * Closes an auction on the clock: picks the winner, marks the rest, and settles
 * immediately when the winning bid carried an autoSettle mandate.
 *
 * Idempotent on status so a retried job can't double-settle.
 */
export async function closeAuction(auctionId: string): Promise<void> {
  const auction = await prisma.marketplaceAuction.findUnique({ where: { id: auctionId } });
  if (!auction || auction.status !== "OPEN") return;

  const winner = await leadingBid(auctionId, auction.kind);
  const reserve = Number(auction.reservePerHour);
  const meetsReserve =
    winner !== null &&
    (auction.kind === "FORWARD"
      ? Number(winner.amountPerHour) >= reserve
      : Number(winner.amountPerHour) <= reserve);

  if (!winner || !meetsReserve) {
    await prisma.$transaction([
      prisma.marketplaceAuction.update({ where: { id: auctionId }, data: { status: "UNMET" } }),
      prisma.auctionBid.updateMany({ where: { auctionId }, data: { status: "LOST" } }),
    ]);
    await domainEvents.publish({ type: "auction.closed", payload: { auctionId, winningBidId: null } });
    return;
  }

  await prisma.$transaction([
    prisma.auctionBid.updateMany({
      where: { auctionId, id: { not: winner.id } },
      data: { status: "LOST" },
    }),
    prisma.auctionBid.update({ where: { id: winner.id }, data: { status: "WON" } }),
    prisma.marketplaceAuction.update({
      where: { id: auctionId },
      data: { status: "CLOSED", winningBidId: winner.id },
    }),
  ]);

  await domainEvents.publish({
    type: "auction.closed",
    payload: { auctionId, winningBidId: winner.id },
  });

  // Close the agent feedback loop.
  //
  // 167 agent decisions had been logged and almost none had a recorded outcome, so
  // every accuracy figure on the ERP page rested on a handful of rows. The outcome is
  // derivable here and nowhere else: an agent-placed bid that won is a decision the
  // market accepted, and one that lost is a decision it rejected. Recording it turns
  // "the agents decide" into "the agents decide well, or they don't".
  //
  // Best-effort: a failure to annotate history must never fail closing an auction.
  try {
    const decisions = await prisma.agentDecisionLog.findMany({
      where: { agentType: "AUCTION", subjectId: auctionId, outcomeAccepted: null },
      select: { id: true, parsedDecision: true },
    });
    for (const d of decisions) {
      const chosen = (d.parsedDecision as { amountPerHour?: number } | null)?.amountPerHour;
      // The agent's decision was accepted if the winning bid is the one it placed.
      const accepted =
        winner.isAgentPlaced && chosen !== undefined && Number(winner.amountPerHour) === chosen;
      await recordAgentOutcome(d.id, accepted);
    }
  } catch (error) {
    console.warn(
      `[auction] could not record agent outcomes for ${auctionId}:`,
      error instanceof Error ? error.message : error
    );
  }

  // Full autonomy is opt-in per bid. Without it the winner must confirm, so no
  // money moves on an agent's judgement alone unless that was chosen.
  if (winner.autoSettle) {
    try {
      await settleAuction(auctionId, winner.bidderId, { viaAgent: true });
    } catch (error) {
      // An auto-settle that can't pay (empty wallet) is a normal outcome, not a
      // job failure. Letting it throw put the close job into BullMQ's retry
      // loop, so a broke winner would have the auction re-closing indefinitely.
      // The auction stays CLOSED and the winner can settle manually once funded.
      console.warn(
        `[auction] auto-settle failed for ${auctionId}, left CLOSED for manual settlement:`,
        error instanceof Error ? error.message : error
      );
    }
  }
}

/**
 * Moves the money for a closed auction. In a FORWARD auction the winning bidder
 * is the buyer; in a REVERSE auction the winning bidder is the seller and the
 * auction's creator is the buyer.
 */
export async function settleAuction(
  auctionId: string,
  actingUserId: string,
  opts: { viaAgent?: boolean } = {}
): Promise<void> {
  const auction = await prisma.marketplaceAuction.findUnique({ where: { id: auctionId } });
  if (!auction) throw new AppError(404, "Auction not found", "NOT_FOUND");
  if (auction.status === "SETTLED") return;
  if (auction.status !== "CLOSED" || !auction.winningBidId) {
    throw new AppError(409, "This auction isn't ready to settle", "NOT_SETTLEABLE");
  }

  const winner = await prisma.auctionBid.findUniqueOrThrow({ where: { id: auction.winningBidId } });
  const buyerId = auction.kind === "FORWARD" ? winner.bidderId : auction.createdById;
  const sellerId = auction.kind === "FORWARD" ? auction.createdById : winner.bidderId;

  if (!opts.viaAgent && actingUserId !== buyerId) {
    throw new AppError(403, "Only the buyer can settle this auction", "FORBIDDEN");
  }

  const fee = computeTradeFee(Number(winner.totalAmount));
  const balance = await getMoneyBalance(buyerId);
  if (balance < fee.buyerTotal) {
    throw new AppError(
      409,
      `Settling needs ${auction.currency} ${fee.buyerTotal.toFixed(2)} but the wallet holds ${auction.currency} ${balance.toFixed(2)}. Top up to continue`,
      "INSUFFICIENT_FUNDS"
    );
  }

  const correlationId = randomUUID();
  await applyWalletWrites([
    {
      userId: buyerId,
      amount: -fee.buyerTotal,
      kind: "PURCHASE",
      currency: auction.currency,
      counterpartyUserId: sellerId,
      correlationId,
      note: `Auction ${auctionId.slice(0, 8)} settled${opts.viaAgent ? " by agent" : ""}`,
    },
    {
      userId: sellerId,
      amount: fee.sellerProceeds,
      kind: "SALE_PROCEEDS",
      currency: auction.currency,
      counterpartyUserId: buyerId,
      correlationId,
      note: `Auction ${auctionId.slice(0, 8)} proceeds (net of seller fee)`,
    },
  ]);

  await prisma.marketplaceAuction.update({ where: { id: auctionId }, data: { status: "SETTLED" } });

  await domainEvents.publish({
    type: "auction.settled",
    payload: {
      auctionId,
      buyerId,
      sellerId,
      amount: fee.buyerTotal,
      viaAgent: Boolean(opts.viaAgent),
    },
  });
}

export async function listMyAuctionActivity(userId: string) {
  const [created, bidOn] = await Promise.all([
    prisma.marketplaceAuction.findMany({
      where: { createdById: userId },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { createdBy: { select: { email: true } }, bids: { where: { status: "ACTIVE" } } },
    }),
    prisma.auctionBid.findMany({
      where: { bidderId: userId },
      orderBy: { createdAt: "desc" },
      take: 25,
      distinct: ["auctionId"],
      include: {
        auction: { include: { createdBy: { select: { email: true } }, bids: { where: { status: "ACTIVE" } } } },
      },
    }),
  ]);

  const shape = (a: (typeof created)[number]) => {
    const sorted = [...a.bids].sort((x, y) =>
      a.kind === "FORWARD"
        ? Number(y.amountPerHour) - Number(x.amountPerHour)
        : Number(x.amountPerHour) - Number(y.amountPerHour)
    );
    return toPublicAuction(a, a.bids.length, sorted[0] ?? null, userId, handleFrom(a.createdBy.email));
  };

  return {
    created: created.map(shape),
    bidding: bidOn.map((b) => shape(b.auction as unknown as (typeof created)[number])),
  };
}

/** Auction totals for the ERP console. */
export async function getAuctionStats() {
  const [byStatus, settled, agentBids, totalBids] = await Promise.all([
    prisma.marketplaceAuction.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.marketplaceAuction.count({ where: { status: "SETTLED" } }),
    prisma.auctionBid.count({ where: { isAgentPlaced: true } }),
    prisma.auctionBid.count(),
  ]);
  return {
    byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
    settledCount: settled,
    totalBids,
    agentPlacedBids: agentBids,
    agentBidShare: totalBids > 0 ? Math.round((agentBids / totalBids) * 100) / 100 : 0,
  };
}
