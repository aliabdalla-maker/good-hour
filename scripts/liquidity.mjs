/**
 * Reports the numbers that decide whether this business exists.
 *
 * Every other metric in the project describes capability: modules built, tests
 * passing, features shipped. FR-030 — real sellers with real inventory — is the
 * only requirement whose failure makes all of them worthless, and it was the one
 * requirement never stated. Nothing surfaced it, so it went unnoticed for the
 * entire build while 76 capability tasks were marked complete.
 *
 * A number nobody looks at is not a metric. Run this:
 *
 *   npm run metrics:liquidity
 *
 * It reads the database in DATABASE_URL. Read-only.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function bar(value, width = 24) {
  const filled = value > 0 ? Math.max(1, Math.min(width, value)) : 0;
  return `${"█".repeat(filled)}${"·".repeat(width - filled)}`;
}

try {
  const [
    sellers,
    activeRooms,
    marketListings,
    auctions,
    bids,
    proxyMandates,
    bookings,
    paidBookings,
    orders,
    paidOrders,
    agentDecisions,
    agentWithOutcome,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "SUPPLIER" } }),
    prisma.room.count({ where: { status: "ACTIVE" } }),
    prisma.marketplaceListing.count({ where: { status: "ACTIVE" } }),
    prisma.marketplaceAuction.count(),
    prisma.auctionBid.count(),
    prisma.auctionBid.count({ where: { maxPerHour: { not: null } } }),
    prisma.booking.count(),
    prisma.booking.count({ where: { status: { in: ["CONFIRMED", "COMPLETED"] } } }),
    prisma.marketplaceOrder.count(),
    prisma.marketplaceOrder.count({ where: { status: "PAID" } }),
    prisma.agentDecisionLog.count(),
    prisma.agentDecisionLog.count({ where: { NOT: { outcomeAccepted: null } } }),
  ]);

  const rows = [
    ["Sellers registered", sellers],
    ["Active rooms/units listed", activeRooms],
    ["Active marketplace listings", marketListings],
    ["Auctions created", auctions],
    ["Auction bids placed", bids],
    ["  ...of which proxy mandates", proxyMandates],
    ["Bookings created", bookings],
    ["  ...reaching CONFIRMED", paidBookings],
    ["Marketplace orders", orders],
    ["  ...reaching PAID", paidOrders],
  ];

  console.log("\nLiquidity — FR-030\n");
  for (const [label, value] of rows) {
    console.log(`  ${label.padEnd(30)} ${String(value).padStart(6)}  ${bar(value)}`);
  }

  // Supply and demand both have to be non-zero for a marketplace to exist. Two
  // separate zeroes is a different problem from one.
  const supply = activeRooms + marketListings;
  const demand = paidBookings + paidOrders + bids;
  console.log("\n  Verdict:");
  if (supply === 0 && demand === 0) {
    console.log("    NOT MET — no supply and no demand. The platform has no market.");
  } else if (supply === 0) {
    console.log("    NOT MET — demand exists with nothing to buy. Supply is the bottleneck.");
  } else if (demand === 0) {
    console.log("    NOT MET — supply exists with no transactions. Demand is the bottleneck.");
  } else {
    console.log(`    Supply ${supply}, demand ${demand}. Update FR-030 in docs/REQUIREMENTS.md.`);
  }

  // Agent-decision feedback: the ratio that tells you whether the AI is any good.
  const coverage = agentDecisions > 0 ? Math.round((agentWithOutcome / agentDecisions) * 100) : 0;
  console.log(
    `\n  Agent decisions logged ${agentDecisions}, with a recorded outcome ${agentWithOutcome} (${coverage}%)`
  );
  if (coverage < 25) {
    console.log("    Without outcomes there is no evidence the agents decide well — only that they decide.");
  }
  console.log();
} finally {
  await prisma.$disconnect();
}
