import { prisma } from "@gihtcx/db";
import { randomUUID } from "node:crypto";
import type {
  CreateMarketplaceListingInput,
  CreateMarketplaceOrderInput,
  MarketplaceListingPublic,
  MarketplaceOrderPublic,
  MarketplaceQuote,
  MarketplaceSearchQuery,
  MarketplaceSearchResult,
} from "@gihtcx/shared";
import { computeTradeFee } from "@gihtcx/shared";
import { featureFlags } from "../../config";
import { AppError } from "../../plugins/errorHandler";
import { domainEvents } from "../../events/bus";
import { getStripeClient } from "../payments/stripeClient";
import { applyWalletWrites, getMoneyBalance } from "../wallet/ledger";

const round2 = (n: number) => Math.round(n * 100) / 100;

type ListingRow = Awaited<ReturnType<typeof prisma.marketplaceListing.findFirst>>;

/**
 * Derives a display handle from an email without revealing it: the local part
 * is truncated and masked, so "alice.smith@example.com" shows as "ali…th".
 * Enough for a buyer to tell two sellers apart, useless for harvesting.
 */
function sellerHandleFrom(email: string): string {
  const local = email.split("@")[0] ?? "seller";
  if (local.length <= 4) return local;
  return `${local.slice(0, 3)}…${local.slice(-2)}`;
}

function toPublic(
  l: NonNullable<ListingRow>,
  seller: { email: string; verificationStatus: string }
): MarketplaceListingPublic {
  return {
    id: l.id,
    sellerId: l.sellerId,
    sellerHandle: sellerHandleFrom(seller.email),
    sellerVerified: seller.verificationStatus === "VERIFIED",
    kind: l.kind,
    title: l.title,
    description: l.description,
    category: l.category,
    price: Number(l.price),
    pricingUnit: l.pricingUnit,
    currency: l.currency,
    imageUrl: l.imageUrl,
    stock: l.stock,
    status: l.status,
    createdAt: l.createdAt.toISOString(),
  };
}

export async function createListing(sellerId: string, input: CreateMarketplaceListingInput) {
  const listing = await prisma.marketplaceListing.create({
    data: {
      sellerId,
      kind: input.kind,
      title: input.title,
      description: input.description,
      category: input.category.trim().toLowerCase(),
      price: input.price,
      pricingUnit: input.pricingUnit,
      imageUrl: input.imageUrl,
      stock: input.stock ?? null,
    },
  });
  const seller = await prisma.user.findUniqueOrThrow({
    where: { id: sellerId },
    select: { email: true, verificationStatus: true },
  });
  return toPublic(listing, seller);
}

/**
 * Text + facet search over the live catalogue.
 *
 * Postgres `ILIKE` over title/description is deliberate: the dataset is small,
 * and a real full-text index (tsvector + GIN) is only worth adding once there's
 * enough inventory for ranking quality to matter. Swapping it later doesn't
 * change this function's contract.
 */
export async function searchListings(query: MarketplaceSearchQuery): Promise<MarketplaceSearchResult> {
  const where: Record<string, unknown> = { status: "ACTIVE" };

  if (query.kind) where.kind = query.kind;
  if (query.category) where.category = query.category.trim().toLowerCase();
  if (query.q) {
    where.OR = [
      { title: { contains: query.q, mode: "insensitive" } },
      { description: { contains: query.q, mode: "insensitive" } },
      { category: { contains: query.q, mode: "insensitive" } },
    ];
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.price = {
      ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
    };
  }

  const orderBy =
    query.sort === "price_asc"
      ? { price: "asc" as const }
      : query.sort === "price_desc"
        ? { price: "desc" as const }
        : { createdAt: "desc" as const };

  const [rows, total, allActive] = await Promise.all([
    prisma.marketplaceListing.findMany({
      where,
      orderBy,
      take: 60,
      include: { seller: { select: { email: true, verificationStatus: true } } },
    }),
    prisma.marketplaceListing.count({ where }),
    // Facet list comes from the whole ACTIVE catalogue, not the filtered set —
    // otherwise picking a category would hide every other category chip.
    prisma.marketplaceListing.findMany({
      where: { status: "ACTIVE" },
      select: { category: true },
      distinct: ["category"],
    }),
  ]);

  return {
    listings: rows.map((r) => toPublic(r, r.seller)),
    total,
    categories: allActive.map((c) => c.category).sort(),
  };
}

export async function getListing(id: string): Promise<MarketplaceListingPublic> {
  const listing = await prisma.marketplaceListing.findUnique({
    where: { id },
    include: { seller: { select: { email: true, verificationStatus: true } } },
  });
  if (!listing) throw new AppError(404, "Listing not found", "NOT_FOUND");
  return toPublic(listing, listing.seller);
}

export async function listMyListings(sellerId: string): Promise<MarketplaceListingPublic[]> {
  const rows = await prisma.marketplaceListing.findMany({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
    include: { seller: { select: { email: true, verificationStatus: true } } },
  });
  return rows.map((r) => toPublic(r, r.seller));
}

/** Fee preview so the buyer sees the 1% before committing, not after. */
export function quoteOrder(unitPrice: number, quantity: number, currency = "GBP"): MarketplaceQuote {
  const fee = computeTradeFee(round2(unitPrice * quantity));
  return {
    subtotal: fee.subtotal,
    buyerFee: fee.buyerFee,
    buyerTotal: fee.buyerTotal,
    sellerFee: fee.sellerFee,
    sellerProceeds: fee.sellerProceeds,
    currency,
  };
}

async function toOrderPublic(
  order: Awaited<ReturnType<typeof prisma.marketplaceOrder.findFirstOrThrow>>,
  viewerId: string,
  clientSecret: string | null = null
): Promise<MarketplaceOrderPublic> {
  const [listing, counterparty] = await Promise.all([
    prisma.marketplaceListing.findUnique({ where: { id: order.listingId }, select: { title: true } }),
    prisma.user.findUnique({
      where: { id: viewerId === order.buyerId ? order.sellerId : order.buyerId },
      select: { email: true },
    }),
  ]);
  return {
    id: order.id,
    listingId: order.listingId,
    listingTitle: listing?.title ?? "(listing removed)",
    buyerId: order.buyerId,
    sellerId: order.sellerId,
    counterpartyEmail: counterparty?.email ?? "unknown",
    quantity: order.quantity,
    unitPrice: Number(order.unitPrice),
    subtotal: Number(order.subtotal),
    buyerFee: Number(order.buyerFee),
    sellerFee: Number(order.sellerFee),
    platformFee: Number(order.platformFee),
    buyerTotal: Number(order.buyerTotal),
    sellerProceeds: Number(order.sellerProceeds),
    currency: order.currency,
    status: order.status,
    paymentMethod: order.paymentMethod,
    clientSecret,
    createdAt: order.createdAt.toISOString(),
  };
}

/**
 * Places an order. 1% is charged to the buyer on top and 1% deducted from the
 * seller's proceeds — the same `computeTradeFee` the bookings and time-credit
 * paths use, so there is one fee implementation and one rounding rule.
 *
 * Wallet-paid orders settle synchronously (money is already on the platform);
 * card-paid orders settle in the webhook.
 */
export async function placeOrder(buyerId: string, input: CreateMarketplaceOrderInput) {
  const listing = await prisma.marketplaceListing.findUnique({ where: { id: input.listingId } });
  if (!listing) throw new AppError(404, "Listing not found", "NOT_FOUND");
  if (listing.status !== "ACTIVE") {
    throw new AppError(409, "That listing isn't available right now", "LISTING_UNAVAILABLE");
  }
  if (listing.sellerId === buyerId) {
    throw new AppError(400, "You can't buy your own listing", "SELF_PURCHASE");
  }
  if (listing.stock !== null && listing.stock < input.quantity) {
    throw new AppError(
      409,
      listing.stock === 0 ? "That listing is sold out" : `Only ${listing.stock} left`,
      "INSUFFICIENT_STOCK"
    );
  }

  const unitPrice = Number(listing.price);
  const fee = computeTradeFee(round2(unitPrice * input.quantity));

  const order = await prisma.marketplaceOrder.create({
    data: {
      listingId: listing.id,
      buyerId,
      sellerId: listing.sellerId,
      quantity: input.quantity,
      unitPrice,
      subtotal: fee.subtotal,
      buyerFee: fee.buyerFee,
      sellerFee: fee.sellerFee,
      platformFee: fee.platformFee,
      buyerTotal: fee.buyerTotal,
      sellerProceeds: fee.sellerProceeds,
      currency: listing.currency,
      paymentMethod: input.paymentMethod,
    },
  });

  if (input.paymentMethod === "WALLET") {
    const balance = await getMoneyBalance(buyerId);
    if (balance < fee.buyerTotal) {
      // Leave the order PENDING_PAYMENT rather than deleting it, so the buyer
      // can top up and retry against the same quoted price.
      throw new AppError(
        409,
        `Your wallet has ${listing.currency} ${balance.toFixed(2)} but this costs ${listing.currency} ${fee.buyerTotal.toFixed(2)} — top up to continue`,
        "INSUFFICIENT_FUNDS"
      );
    }
    await settleOrder(order.id);
    const settled = await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: order.id } });
    return toOrderPublic(settled, buyerId);
  }

  if (!featureFlags.paymentsEnabled) {
    await prisma.marketplaceOrder.update({
      where: { id: order.id },
      data: { stripePaymentIntentId: `pi_simulated_order_${order.id}` },
    });
    return toOrderPublic(order, buyerId);
  }

  const stripe = getStripeClient();
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(fee.buyerTotal * 100),
    currency: listing.currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata: { marketplaceOrderId: order.id },
  });
  await prisma.marketplaceOrder.update({
    where: { id: order.id },
    data: { stripePaymentIntentId: intent.id },
  });

  return toOrderPublic(order, buyerId, intent.client_secret);
}

/**
 * Moves the money and marks the order paid. Idempotent on `settledAt` — called
 * both synchronously (wallet) and from the Stripe webhook (card, which retries).
 *
 * A card-paid order still credits the seller's wallet: the buyer's money
 * arrived at the platform via Stripe, so only the seller side moves internally.
 */
export async function settleOrder(orderId: string): Promise<void> {
  const order = await prisma.marketplaceOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError(404, "Order not found", "NOT_FOUND");
  if (order.settledAt) return;

  const correlationId = randomUUID();
  const writes = [];

  if (order.paymentMethod === "WALLET") {
    writes.push({
      userId: order.buyerId,
      amount: -Number(order.buyerTotal),
      kind: "PURCHASE" as const,
      currency: order.currency,
      relatedOrderId: order.id,
      counterpartyUserId: order.sellerId,
      correlationId,
      note: `Order ${order.id.slice(0, 8)}`,
    });
  }

  writes.push({
    userId: order.sellerId,
    amount: Number(order.sellerProceeds),
    kind: "SALE_PROCEEDS" as const,
    currency: order.currency,
    relatedOrderId: order.id,
    counterpartyUserId: order.buyerId,
    correlationId,
    note: `Sale ${order.id.slice(0, 8)} (net of 1% seller fee)`,
  });

  await applyWalletWrites(writes);

  await prisma.$transaction(async (tx) => {
    await tx.marketplaceOrder.update({
      where: { id: order.id },
      data: { status: "PAID", settledAt: new Date() },
    });

    // Conditional decrement, not read-modify-write.
    //
    // The old version did findUnique -> compute remaining -> update, in a
    // default-isolation transaction and in a *different* transaction from the
    // stock check in placeOrder. Two concurrent buyers of the last unit both
    // passed the check and both settled, and `Math.max(0, …)` quietly clamped
    // what should have been -1, hiding the oversell. Guarding on
    // `stock: { gte: quantity }` makes the database arbitrate: exactly one
    // update matches.
    const claimed = await tx.marketplaceListing.updateMany({
      where: { id: order.listingId, stock: { gte: order.quantity } },
      data: { stock: { decrement: order.quantity } },
    });

    const listing = await tx.marketplaceListing.findUnique({
      where: { id: order.listingId },
      select: { stock: true },
    });

    // stock === null means unmetered (a service), so nothing to claim.
    if (listing?.stock !== null && listing !== null && claimed.count === 0) {
      throw new AppError(
        409,
        "That listing sold out while your payment was being processed",
        "INSUFFICIENT_STOCK"
      );
    }
    if (listing?.stock === 0) {
      await tx.marketplaceListing.update({
        where: { id: order.listingId },
        data: { status: "SOLD_OUT" },
      });
    }
  });

  await domainEvents.publish({
    type: "order.paid",
    payload: {
      orderId: order.id,
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      amount: Number(order.buyerTotal),
    },
  });
}

export async function markOrderFailed(orderId: string): Promise<void> {
  await prisma.marketplaceOrder.updateMany({
    where: { id: orderId, status: "PENDING_PAYMENT" },
    data: { status: "CANCELLED" },
  });
}

export async function listMyOrders(userId: string): Promise<MarketplaceOrderPublic[]> {
  const orders = await prisma.marketplaceOrder.findMany({
    where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return Promise.all(orders.map((o) => toOrderPublic(o, userId)));
}

/** Marketplace totals for the ERP console. */
export async function getMarketplaceStats() {
  const [listingGroups, paidAgg, orderCount] = await Promise.all([
    prisma.marketplaceListing.groupBy({ by: ["kind"], _count: { _all: true }, where: { status: "ACTIVE" } }),
    prisma.marketplaceOrder.aggregate({
      where: { status: "PAID" },
      _sum: { subtotal: true, platformFee: true, sellerProceeds: true },
    }),
    prisma.marketplaceOrder.count({ where: { status: "PAID" } }),
  ]);

  const byKind = Object.fromEntries(listingGroups.map((g) => [g.kind, g._count._all]));
  return {
    activeProducts: byKind.PRODUCT ?? 0,
    activeServices: byKind.SERVICE ?? 0,
    paidOrders: orderCount,
    grossMerchandiseValue: round2(Number(paidAgg._sum.subtotal ?? 0)),
    commissionRevenue: round2(Number(paidAgg._sum.platformFee ?? 0)),
    sellerProceedsTotal: round2(Number(paidAgg._sum.sellerProceeds ?? 0)),
  };
}
