import { prisma } from "@gihtcx/db";
import { randomUUID } from "node:crypto";
import { AppError } from "../../plugins/errorHandler";

/**
 * Subject access and erasure — CR-005.
 *
 * These were the two GDPR obligations with no implementation at all: a user could
 * neither obtain their data nor have it removed.
 *
 * Erasure needs stating plainly, because it is a genuine architectural tension
 * rather than an oversight: **the ledgers are append-only by design.** A time
 * credit or wallet entry is a financial record, and deleting one would break the
 * invariant that a balance equals the sum of its entries — the property every
 * money test in this repo relies on, and the one that makes double-spends
 * detectable.
 *
 * So erasure here is pseudonymisation of the *person*, retaining the
 * *transactions*: identifying fields are overwritten irreversibly, and the ledger
 * rows survive attached to an id that no longer identifies anyone. That is the
 * usual resolution where a legal basis to retain financial records exists, and it
 * is a determination someone qualified should confirm (docs/COMPLIANCE.md).
 */

/** Marker domain — reserved by RFC 2606, so it can never be a real address. */
const ERASED_EMAIL_DOMAIN = "erased.invalid";
export const ERASED_CRM_TAG = "ERASED";

export interface DataExport {
  exportedAt: string;
  account: Record<string, unknown>;
  bookings: unknown[];
  marketplaceOrders: unknown[];
  creditLedger: unknown[];
  walletLedger: unknown[];
  reviews: unknown[];
  messages: unknown[];
  consentEvents: unknown[];
  notifications: unknown[];
}

/**
 * Everything held about one user, in one JSON document.
 *
 * Deliberately excludes `passwordHash`: a subject-access request is a right to
 * one's own data, not an instruction to hand out a credential hash — including to
 * whoever has temporarily got hold of the session.
 */
export async function exportUserData(userId: string): Promise<DataExport> {
  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      phone: true,
      isBusinessAccount: true,
      marketingOptIn: true,
      verificationStatus: true,
      crmStage: true,
      crmTags: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!account) throw new AppError(404, "Account not found", "NOT_FOUND");

  const [
    bookings,
    marketplaceOrders,
    creditLedger,
    walletLedger,
    reviews,
    messages,
    consentEvents,
    notifications,
  ] = await Promise.all([
    prisma.booking.findMany({ where: { travellerId: userId } }),
    prisma.marketplaceOrder.findMany({ where: { OR: [{ buyerId: userId }, { sellerId: userId }] } }),
    prisma.creditLedgerEntry.findMany({ where: { userId } }),
    prisma.walletLedgerEntry.findMany({ where: { userId } }),
    prisma.review.findMany({ where: { authorId: userId } }),
    prisma.message.findMany({ where: { senderId: userId } }),
    prisma.consentEvent.findMany({ where: { userId } }),
    prisma.notification.findMany({ where: { userId } }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    account,
    bookings,
    marketplaceOrders,
    creditLedger,
    walletLedger,
    reviews,
    messages,
    consentEvents,
    notifications,
  };
}

export interface ErasureResult {
  erased: true;
  /** Retained rows, so the user is told what survives and why. */
  retained: { creditLedgerEntries: number; walletLedgerEntries: number; bookings: number };
}

/**
 * Irreversibly pseudonymises the account, retaining financial records.
 *
 * Refuses while money is still owed in either direction: erasing an account
 * mid-transaction would strand a counterparty with an unresolvable dispute, and a
 * pending refund would have nowhere to go. The user is told which, so the request
 * can succeed once settled rather than failing opaquely.
 */
export async function eraseUserAccount(userId: string): Promise<ErasureResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "Account not found", "NOT_FOUND");
  if (user.crmTags.includes(ERASED_CRM_TAG)) {
    throw new AppError(409, "This account has already been erased", "ALREADY_ERASED");
  }

  const [openBookings, openOrders] = await Promise.all([
    prisma.booking.count({ where: { travellerId: userId, status: "PENDING_PAYMENT" } }),
    prisma.marketplaceOrder.count({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }], status: "PENDING_PAYMENT" },
    }),
  ]);
  if (openBookings + openOrders > 0) {
    throw new AppError(
      409,
      "Finish or cancel your outstanding bookings and orders before erasing your account",
      "OUTSTANDING_OBLIGATIONS"
    );
  }

  const [creditLedgerEntries, walletLedgerEntries, bookings] = await Promise.all([
    prisma.creditLedgerEntry.count({ where: { userId } }),
    prisma.walletLedgerEntry.count({ where: { userId } }),
    prisma.booking.count({ where: { travellerId: userId } }),
  ]);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        // A reserved domain plus a fresh uuid: unique, non-reversible, and
        // obviously not a real address to anyone reading the table.
        email: `erased-${randomUUID()}@${ERASED_EMAIL_DOMAIN}`,
        // Not a valid hash for any password, so the account cannot be logged into.
        passwordHash: "erased",
        phone: null,
        marketingOptIn: false,
        crmStage: "DORMANT",
        crmTags: [ERASED_CRM_TAG],
      },
    }),
    // In-app notifications are content, not record-keeping — they go.
    prisma.notification.deleteMany({ where: { userId } }),
    // Message bodies are personal content; the thread structure is another party's
    // record, so the row survives with its body cleared.
    prisma.message.updateMany({ where: { senderId: userId }, data: { body: "[erased]" } }),
    prisma.review.updateMany({ where: { authorId: userId }, data: { comment: null } }),
  ]);

  return { erased: true, retained: { creditLedgerEntries, walletLedgerEntries, bookings } };
}
