import { prisma } from "@gihtcx/db";
import type {
  CampaignAudience,
  CampaignInput,
  CampaignResult,
  NotificationCategory,
  NotificationChannel,
  UpdatePreferencesInput,
} from "@gihtcx/shared";
import { featureFlags } from "../../config";
import { domainEvents } from "../../events/bus";
import { unsubscribeUrl, verifyUnsubToken } from "../../lib/unsubscribe";
import { sendEmail, sendSms } from "./channels";

interface NotifyInput {
  userId: string;
  type: string;
  subject: string;
  body: string;
  category?: NotificationCategory;
  channels?: NotificationChannel[];
  data?: Record<string, unknown>;
}

/**
 * Core fan-out: delivers a message across the requested channels and records
 * one Notification row per channel. IN_APP rows are the user's feed; EMAIL/SMS
 * rows are delivery records. Marketing messages are only sent on external
 * channels to users who have opted in; SMS is only sent to users with a phone.
 */
export async function notify(input: NotifyInput) {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) return;

  const category = input.category ?? "TRANSACTIONAL";
  const channels = input.channels ?? ["IN_APP", "EMAIL"];

  for (const channel of channels) {
    if (channel === "SMS" && !user.phone) continue;
    if (category === "MARKETING" && channel !== "IN_APP" && !user.marketingOptIn) continue;

    let status: "SENT" | "FAILED" = "SENT";
    let providerRef: string | undefined;
    try {
      if (channel === "EMAIL") {
        // Marketing email legally requires a working unsubscribe mechanism.
        const emailBody =
          category === "MARKETING"
            ? `${input.body}\n\n—\nYou received this because you opted into Good Hours updates.\nUnsubscribe: ${unsubscribeUrl(user.id)}`
            : input.body;
        const r = await sendEmail(user.email, input.subject, emailBody);
        providerRef = r.providerRef;
      } else if (channel === "SMS") {
        const r = await sendSms(user.phone as string, `${input.subject}: ${input.body}`);
        providerRef = r.providerRef;
      }
    } catch {
      status = "FAILED";
    }

    await prisma.notification.create({
      data: {
        userId: user.id,
        channel,
        category,
        type: input.type,
        subject: input.subject,
        body: input.body,
        status,
        providerRef,
        ...(input.data ? { data: input.data as object } : {}),
      },
    });
  }
}

/** The user's in-app notification feed (most recent first). */
export async function listNotifications(userId: string) {
  return prisma.notification.findMany({
    where: { userId, channel: "IN_APP" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function markNotificationRead(userId: string, id: string) {
  await prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, channel: "IN_APP", readAt: null },
    data: { readAt: new Date() },
  });
}

export async function getPreferences(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return { marketingOptIn: user?.marketingOptIn ?? true, phone: user?.phone ?? null };
}

async function logConsent(userId: string, granted: boolean, source: string) {
  await prisma.consentEvent.create({
    data: { userId, channel: "marketing_email", granted, source },
  });
}

export async function updatePreferences(userId: string, input: UpdatePreferencesInput) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.marketingOptIn !== undefined ? { marketingOptIn: input.marketingOptIn } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    },
  });
  if (input.marketingOptIn !== undefined) {
    await logConsent(userId, input.marketingOptIn, "preferences");
  }
  return { marketingOptIn: user.marketingOptIn, phone: user.phone };
}

/**
 * One-click unsubscribe from a marketing email link (no auth). Verifies the
 * HMAC token, turns off marketing opt-in, and records the withdrawal.
 * Returns false on an invalid/forged token.
 */
export async function unsubscribeByToken(userId: string, token: string): Promise<boolean> {
  if (!verifyUnsubToken(userId, token)) return false;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  if (user.marketingOptIn) {
    await prisma.user.update({ where: { id: userId }, data: { marketingOptIn: false } });
    await logConsent(userId, false, "unsubscribe_link");
  }
  return true;
}

/**
 * Broadcasts a marketing campaign (announcing platform services) to an
 * audience. Respects marketing opt-in for external channels; in-app is always
 * delivered so it appears in every recipient's feed.
 */
export async function sendCampaign(input: CampaignInput): Promise<CampaignResult> {
  const audience = input.audience;
  const where = audience === "ALL" ? {} : { role: audience };
  const users = await prisma.user.findMany({ where });

  let recipients = 0;
  let skippedOptOut = 0;
  for (const user of users) {
    if (!user.marketingOptIn) {
      skippedOptOut += 1;
      // Opt-out only governs email/SMS; still surface it in their in-app feed.
      await notify({
        userId: user.id,
        type: "campaign",
        subject: input.subject,
        body: input.body,
        category: "MARKETING",
        channels: ["IN_APP"],
      });
      continue;
    }
    await notify({
      userId: user.id,
      type: "campaign",
      subject: input.subject,
      body: input.body,
      category: "MARKETING",
      channels: ["IN_APP", "EMAIL"],
    });
    recipients += 1;
  }

  return {
    audience: audience as CampaignAudience,
    recipients,
    skippedOptOut,
    emailDelivery: featureFlags.emailEnabled ? "provider" : "logged",
  };
}

export function toPublicNotification(n: {
  id: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  type: string;
  subject: string;
  body: string;
  data: unknown;
  status: string;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: n.id,
    channel: n.channel,
    category: n.category,
    type: n.type,
    subject: n.subject,
    body: n.body,
    data: n.data ?? null,
    status: n.status as "QUEUED" | "SENT" | "FAILED",
    readAt: n.readAt ? n.readAt.toISOString() : null,
    createdAt: n.createdAt.toISOString(),
  };
}

/**
 * Transactional notifications, driven off the domain event bus. Both sides of
 * the marketplace are kept informed: travellers about their bookings/matches,
 * suppliers about confirmed bookings on their rooms.
 */
export function registerNotificationListeners() {
  domainEvents.onEvent("booking.created", async ({ bookingId, travellerId }) => {
    await notify({
      userId: travellerId,
      type: "booking.created",
      subject: "Booking received — payment pending",
      body: `Your booking ${bookingId} is reserved and awaiting payment.`,
      data: { bookingId },
    });
  });

  domainEvents.onEvent("booking.confirmed", async ({ bookingId }) => {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { room: { include: { property: true } } },
    });
    if (!booking) return;

    await notify({
      userId: booking.travellerId,
      type: "booking.confirmed",
      subject: "Booking confirmed 🎉",
      body: `Your booking ${bookingId} is confirmed for ${booking.startsAt.toUTCString()}.`,
      data: { bookingId },
    });

    // Supplier-side transactional notification.
    await notify({
      userId: booking.room.property.supplierId,
      type: "booking.confirmed.supplier",
      subject: "You have a new confirmed booking",
      body: `${booking.room.name} is booked and paid for ${booking.startsAt.toUTCString()}. Payout: ${booking.currency} ${Number(booking.supplierPayout).toFixed(2)}.`,
      data: { bookingId },
    });
  });

  domainEvents.onEvent("offer.submitted", async ({ offerId, bookingRequestId }) => {
    const request = await prisma.bookingRequest.findUnique({ where: { id: bookingRequestId } });
    if (!request) return;
    await notify({
      userId: request.travellerId,
      type: "offer.submitted",
      subject: "New offer on your request",
      body: `A supplier submitted offer ${offerId} for your request. Review it to book.`,
      data: { bookingRequestId, offerId },
    });
  });

  domainEvents.onEvent("match.recommended", async ({ bookingRequestId, offerId }) => {
    const request = await prisma.bookingRequest.findUnique({ where: { id: bookingRequestId } });
    if (!request) return;
    await notify({
      userId: request.travellerId,
      type: "match.recommended",
      subject: "We found your best match",
      body: `Offer ${offerId} is our AI-recommended match for your request.`,
      data: { bookingRequestId, offerId },
    });
  });

  domainEvents.onEvent("payment.succeeded", async ({ bookingId }) => {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return;
    await notify({
      userId: booking.travellerId,
      type: "payment.succeeded",
      subject: "Payment receipt",
      body: `We received ${booking.currency} ${Number(booking.totalAmount).toFixed(2)} for booking ${bookingId}. Thank you!`,
      data: { bookingId },
    });
  });
}
