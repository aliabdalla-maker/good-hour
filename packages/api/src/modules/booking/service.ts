import { prisma } from "@gihtcx/db";
import type { BookingSource, BookingStatus, CreateBookingInput } from "@gihtcx/shared";
import { computeFeeBreakdown } from "@gihtcx/shared";
import { config } from "../../config";
import { AppError } from "../../plugins/errorHandler";
import { domainEvents } from "../../events/bus";
import { bookingExpiryQueue } from "../../queue/queues";
import { getRoomById } from "../listings";
import { createPaymentIntentForBooking, refundBookingPayment } from "../payments";
import { getSuggestedRateForRoom } from "../pricing-agent";
import { assertTransitionAllowed } from "./stateMachine";
import { ensureSlotsGenerated, isRangeFullyOpen } from "./slotService";

/**
 * Schedules the delayed job that releases an unpaid booking's held slots.
 * Uses the booking id as the job id so re-enqueuing is idempotent.
 */
async function scheduleReservationExpiry(bookingId: string) {
  await bookingExpiryQueue.add(
    "expire",
    { bookingId },
    {
      delay: config.RESERVATION_HOLD_MINUTES * 60 * 1000,
      jobId: `booking-expiry-${bookingId}`,
      removeOnComplete: true,
      removeOnFail: true,
    }
  );
}

function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (60 * 60 * 1000);
}

export async function createDirectBooking(travellerId: string, input: CreateBookingInput) {
  const room = await getRoomById(input.roomId);
  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  const hours = hoursBetween(startsAt, endsAt);

  if (!Number.isInteger(hours) || hours <= 0) {
    throw new AppError(400, "Booking range must be a whole number of hours", "INVALID_RANGE");
  }
  if (hours < room.minHours || hours > room.maxHours) {
    throw new AppError(
      400,
      `This room can only be booked for ${room.minHours}-${room.maxHours} hours`,
      "INVALID_DURATION"
    );
  }

  await ensureSlotsGenerated(room.id);

  const fullyOpen = await isRangeFullyOpen(room.id, startsAt, endsAt);
  if (!fullyOpen) {
    throw new AppError(409, "This room is not available for the full requested range", "SLOT_UNAVAILABLE");
  }

  const hourlyRate = input.useAiSuggestedRate
    ? (await getSuggestedRateForRoom(room.id)).recommendedHourlyRate
    : Number(room.baseHourlyRate);
  const subtotal = Math.round(hourlyRate * hours * 100) / 100;
  const fee = computeFeeBreakdown(subtotal);
  const reservationExpiresAt = new Date(Date.now() + config.RESERVATION_HOLD_MINUTES * 60 * 1000);

  const booking = await prisma.$transaction(async (tx) => {
    const claimed = await tx.availabilitySlot.updateMany({
      where: { roomId: room.id, startsAt: { gte: startsAt, lt: endsAt }, status: "OPEN" },
      data: { status: "HELD" },
    });
    if (claimed.count !== hours) {
      throw new AppError(409, "Slots were claimed by another booking, please retry", "SLOT_CONFLICT");
    }

    const created = await tx.booking.create({
      data: {
        travellerId,
        roomId: room.id,
        startsAt,
        endsAt,
        subtotalAmount: fee.subtotal,
        platformFee: fee.platformFee,
        supplierPayout: fee.supplierPayout,
        totalAmount: fee.travellerTotal,
        currency: room.currency,
        isCorporateRate: input.isCorporateRate,
        source: "DIRECT_SEARCH",
        status: "PENDING_PAYMENT",
        reservationExpiresAt,
      },
    });

    // Slots stay HELD (not BOOKED) until payment succeeds — just attach the
    // booking so the expiry job / payment confirmation can find them.
    await tx.availabilitySlot.updateMany({
      where: { roomId: room.id, startsAt: { gte: startsAt, lt: endsAt } },
      data: { bookingId: created.id },
    });

    return created;
  });

  await scheduleReservationExpiry(booking.id);

  // The traveller is charged the subtotal plus their half of the platform fee.
  const { clientSecret } = await createPaymentIntentForBooking(booking.id, fee.travellerTotal, room.currency);

  await domainEvents.publish({ type: "booking.created", payload: { bookingId: booking.id, travellerId } });

  return { booking, clientSecret };
}

/**
 * Called by the booking-expiry worker: if the booking is still awaiting
 * payment past its hold window, mark it EXPIRED and release its held slots
 * back to OPEN. No-op if it was already paid, cancelled, or expired.
 */
export async function releaseExpiredReservation(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking || booking.status !== "PENDING_PAYMENT") return;

  await prisma.$transaction([
    prisma.booking.update({ where: { id: bookingId }, data: { status: "EXPIRED" } }),
    prisma.availabilitySlot.updateMany({
      where: { bookingId },
      data: { status: "OPEN", bookingId: null },
    }),
  ]);

  await domainEvents.publish({ type: "booking.cancelled", payload: { bookingId } });
}

export async function listBookingsForTraveller(travellerId: string) {
  return prisma.booking.findMany({
    where: { travellerId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBookingById(bookingId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    throw new AppError(404, "Booking not found", "NOT_FOUND");
  }
  return booking;
}

/** Traveller-facing receipt: line items + host/item context. Owner or admin only. */
export async function getReceipt(userId: string, role: string, bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { room: { include: { property: true } } },
  });
  if (!booking) throw new AppError(404, "Booking not found", "NOT_FOUND");
  if (role !== "ADMIN" && booking.travellerId !== userId) {
    throw new AppError(403, "You do not own this booking", "FORBIDDEN");
  }
  const hours = (booking.endsAt.getTime() - booking.startsAt.getTime()) / 3_600_000;
  const subtotal = Number(booking.subtotalAmount);
  const total = Number(booking.totalAmount);
  return {
    bookingId: booking.id,
    status: booking.status as BookingStatus,
    itemName: booking.room.name,
    category: booking.room.property.category as "ROOM" | "CAR" | "TRAVEL_SERVICE",
    hostName: booking.room.property.name,
    city: booking.room.property.city,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    hours: Math.round(hours * 100) / 100,
    currency: booking.currency,
    subtotal,
    travellerFee: Math.round((total - subtotal) * 100) / 100,
    total,
    issuedAt: booking.createdAt.toISOString(),
  };
}

/** Supplier earnings summary + booking list across all their rooms. */
export async function getSupplierEarnings(supplierId: string) {
  const bookings = await prisma.booking.findMany({
    where: { room: { property: { supplierId } } },
    include: { room: true },
    orderBy: { startsAt: "desc" },
    take: 100,
  });
  const earned = bookings
    .filter((b) => b.status === "CONFIRMED" || b.status === "COMPLETED")
    .reduce((sum, b) => sum + Number(b.supplierPayout), 0);
  return {
    currency: bookings[0]?.currency ?? "GBP",
    totalEarned: Math.round(earned * 100) / 100,
    confirmedCount: bookings.filter((b) => b.status === "CONFIRMED").length,
    bookings: bookings.map((b) => ({
      id: b.id,
      itemName: b.room.name,
      status: b.status as BookingStatus,
      startsAt: b.startsAt.toISOString(),
      endsAt: b.endsAt.toISOString(),
      currency: b.currency,
      payout: Number(b.supplierPayout),
    })),
  };
}

export async function cancelBooking(bookingId: string, travellerId: string) {
  const booking = await getBookingById(bookingId);
  if (booking.travellerId !== travellerId) {
    throw new AppError(403, "You do not own this booking", "FORBIDDEN");
  }
  assertTransitionAllowed(booking.status, "CANCELLED");
  const wasPaid = booking.status === "CONFIRMED";

  await prisma.$transaction([
    prisma.booking.update({ where: { id: bookingId }, data: { status: "CANCELLED" } }),
    prisma.availabilitySlot.updateMany({
      where: { bookingId },
      data: { status: "OPEN", bookingId: null },
    }),
  ]);

  // Refund a paid booking. (A production system would apply the cancellation
  // policy here — full/partial/no refund by lead time.)
  if (wasPaid) {
    await refundBookingPayment(bookingId);
  }

  await domainEvents.publish({ type: "booking.cancelled", payload: { bookingId } });
}

export function toPublicBooking(booking: {
  id: string;
  travellerId: string;
  roomId: string;
  startsAt: Date;
  endsAt: Date;
  subtotalAmount: unknown;
  platformFee: unknown;
  supplierPayout: unknown;
  totalAmount: unknown;
  currency: string;
  isCorporateRate: boolean;
  source: BookingSource;
  isAgentAccepted: boolean;
  status: BookingStatus;
}, clientSecret?: string | null) {
  return {
    id: booking.id,
    travellerId: booking.travellerId,
    roomId: booking.roomId,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    subtotalAmount: Number(booking.subtotalAmount),
    platformFee: Number(booking.platformFee),
    supplierPayout: Number(booking.supplierPayout),
    totalAmount: Number(booking.totalAmount),
    currency: booking.currency,
    isCorporateRate: booking.isCorporateRate,
    source: booking.source,
    isAgentAccepted: booking.isAgentAccepted,
    status: booking.status,
    clientSecret: clientSecret ?? null,
  };
}
