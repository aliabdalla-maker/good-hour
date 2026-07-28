import { prisma } from "@gihtcx/db";
import type { ErpOverview } from "@gihtcx/shared";
import { generateAiInsights } from "./insights";
import { getOutstandingCreditLiability } from "../credits";
import { getWalletLiability } from "../wallet";
import { getMarketplaceStats } from "../marketplace";

// Bookings in these states represent real, recognised revenue -- unlike
// PENDING_PAYMENT (not yet paid) or CANCELLED/EXPIRED (never collected).
const REVENUE_STATUSES = ["CONFIRMED", "COMPLETED"] as const;

async function getFinancial(): Promise<ErpOverview["financial"]> {
  const [bookingAgg, refundAgg] = await Promise.all([
    prisma.booking.aggregate({
      where: { status: { in: [...REVENUE_STATUSES] } },
      _sum: { subtotalAmount: true, platformFee: true, supplierPayout: true },
    }),
    prisma.payment.aggregate({ where: { status: "refunded" }, _sum: { amount: true } }),
  ]);

  return {
    grossBookingValue: Number(bookingAgg._sum.subtotalAmount ?? 0),
    platformFeeRevenue: Number(bookingAgg._sum.platformFee ?? 0),
    supplierPayoutsTotal: Number(bookingAgg._sum.supplierPayout ?? 0),
    refundedTotal: Number(refundAgg._sum.amount ?? 0),
    // Single-currency deployment today (GBP everywhere) -- if multi-currency
    // ever ships, this needs a currency-keyed breakdown instead of one total.
    currency: "GBP",
  };
}

async function getBookingPipeline(): Promise<ErpOverview["bookingPipeline"]> {
  const groups = await prisma.booking.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
}

/** Per-supplier payout ledger. Dataset is small enough to aggregate in JS rather than a raw SQL join. */
async function getSupplierLedger(): Promise<ErpOverview["supplierLedger"]> {
  const [suppliers, propertyCounts, revenueBookings] = await Promise.all([
    prisma.user.findMany({
      where: { role: "SUPPLIER" },
      select: { id: true, email: true, verificationStatus: true },
    }),
    prisma.property.groupBy({ by: ["supplierId"], _count: { _all: true } }),
    prisma.booking.findMany({
      where: { status: { in: [...REVENUE_STATUSES] } },
      select: { supplierPayout: true, room: { select: { property: { select: { supplierId: true } } } } },
    }),
  ]);

  const propertyCountMap = new Map(propertyCounts.map((p) => [p.supplierId, p._count._all]));
  const revenueMap = new Map<string, { count: number; payout: number }>();
  for (const booking of revenueBookings) {
    const supplierId = booking.room.property.supplierId;
    const entry = revenueMap.get(supplierId) ?? { count: 0, payout: 0 };
    entry.count += 1;
    entry.payout += Number(booking.supplierPayout);
    revenueMap.set(supplierId, entry);
  }

  return suppliers
    .map((s) => {
      const revenue = revenueMap.get(s.id) ?? { count: 0, payout: 0 };
      return {
        supplierId: s.id,
        email: s.email,
        verificationStatus: s.verificationStatus,
        propertyCount: propertyCountMap.get(s.id) ?? 0,
        confirmedBookings: revenue.count,
        totalPayout: Math.round(revenue.payout * 100) / 100,
      };
    })
    .sort((a, b) => b.totalPayout - a.totalPayout);
}

/** Per-agent-type accuracy/throughput, from AgentDecisionLog.outcomeAccepted + latencyMs. */
async function getAgentOps(): Promise<ErpOverview["agentOps"]> {
  const rows = await prisma.agentDecisionLog.findMany({
    select: { agentType: true, outcomeAccepted: true, latencyMs: true },
  });

  const byType = new Map<string, { total: number; accepted: number; rejected: number; noOutcome: number; latencySum: number }>();
  for (const row of rows) {
    const entry = byType.get(row.agentType) ?? { total: 0, accepted: 0, rejected: 0, noOutcome: 0, latencySum: 0 };
    entry.total += 1;
    entry.latencySum += row.latencyMs;
    if (row.outcomeAccepted === true) entry.accepted += 1;
    else if (row.outcomeAccepted === false) entry.rejected += 1;
    else entry.noOutcome += 1;
    byType.set(row.agentType, entry);
  }

  return [...byType.entries()].map(([agentType, e]) => ({
    agentType,
    totalDecisions: e.total,
    accepted: e.accepted,
    rejected: e.rejected,
    noOutcomeYet: e.noOutcome,
    avgLatencyMs: e.total > 0 ? Math.round(e.latencySum / e.total) : 0,
  }));
}

/** CRM stage breakdown -- queried directly rather than via the crm module, since ERP only needs the summary, not full contact records. */
async function getCrmSnapshot(): Promise<ErpOverview["crm"]> {
  const groups = await prisma.user.groupBy({ by: ["crmStage"], _count: { _all: true } });
  const byStage = Object.fromEntries(groups.map((g) => [g.crmStage, g._count._all]));
  const total = groups.reduce((sum, g) => sum + g._count._all, 0);
  return { total, byStage };
}

/** Reverse-bidding (BookingRequest/SupplierOffer) throughput -- the C2B/B2A/A2B side of the marketplace. */
async function getBiddingPipeline(): Promise<ErpOverview["bidding"]> {
  const [requestGroups, totalOffers, agentSubmittedOffers] = await Promise.all([
    prisma.bookingRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.supplierOffer.count(),
    prisma.supplierOffer.count({ where: { isAgentSubmitted: true } }),
  ]);

  const requestsByStatus = Object.fromEntries(requestGroups.map((g) => [g.status, g._count._all]));
  const totalRequests = requestGroups.reduce((sum, g) => sum + g._count._all, 0);
  const matched = requestsByStatus.MATCHED ?? 0;

  return {
    requestsByStatus,
    totalOffers,
    agentSubmittedOffers,
    avgOffersPerRequest: totalRequests > 0 ? Math.round((totalOffers / totalRequests) * 100) / 100 : 0,
    matchRate: totalRequests > 0 ? Math.round((matched / totalRequests) * 1000) / 1000 : 0,
  };
}

export async function getErpOverview(): Promise<ErpOverview> {
  const [
    financial,
    bookingPipeline,
    supplierLedger,
    agentOps,
    crm,
    bidding,
    creditEconomy,
    marketplace,
    wallet,
  ] = await Promise.all([
    getFinancial(),
    getBookingPipeline(),
    getSupplierLedger(),
    getAgentOps(),
    getCrmSnapshot(),
    getBiddingPipeline(),
    getOutstandingCreditLiability(),
    getMarketplaceStats(),
    getWalletLiability(),
  ]);

  const aiInsights = await generateAiInsights({
    financial,
    bookingPipeline,
    supplierLedger,
    agentOps,
    crm,
    bidding,
    creditEconomy,
    marketplace,
    wallet,
  });

  return {
    financial,
    bookingPipeline,
    supplierLedger,
    agentOps,
    crm,
    bidding,
    creditEconomy,
    marketplace,
    wallet,
    aiInsights,
    generatedAt: new Date().toISOString(),
  };
}
