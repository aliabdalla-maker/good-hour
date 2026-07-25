import { prisma } from "@gihtcx/db";
import type { PricingAgentInput } from "@gihtcx/shared";
import { AppError } from "../../plugins/errorHandler";

const MIN_RATE_MULTIPLIER = 0.6;
const MAX_RATE_MULTIPLIER = 2.5;

export async function buildPricingInputForRoom(roomId: string, now = new Date()): Promise<PricingAgentInput> {
  const room = await prisma.room.findUnique({ where: { id: roomId }, include: { property: true } });
  if (!room) {
    throw new AppError(404, "Room not found", "NOT_FOUND");
  }

  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [totalSlotsNext24h, bookedSlotsNext24h, recentBookingCount] = await Promise.all([
    prisma.availabilitySlot.count({
      where: { roomId, startsAt: { gte: now, lt: in24h } },
    }),
    prisma.availabilitySlot.count({
      where: { roomId, startsAt: { gte: now, lt: in24h }, status: { not: "OPEN" } },
    }),
    prisma.booking.count({
      where: { roomId, createdAt: { gte: in7d } },
    }),
  ]);

  const currentSlot = await prisma.availabilitySlot.findFirst({
    where: { roomId, startsAt: { lte: now }, endsAt: { gt: now } },
  });

  const baseHourlyRate = Number(room.baseHourlyRate);

  return {
    roomId: room.id,
    city: room.property.city,
    baseHourlyRate,
    currency: room.currency,
    occupancy: {
      currentSlotUtilizationPct: currentSlot && currentSlot.status !== "OPEN" ? 100 : 0,
      next24hUtilizationPct:
        totalSlotsNext24h > 0 ? Math.round((bookedSlotsNext24h / totalSlotsNext24h) * 100) : 0,
    },
    demandSignals: {
      recentSearchCountForArea24h: 0,
      recentBookingCountForRoom7d: recentBookingCount,
      competitorAvgRateInRadius: null,
    },
    timeContext: {
      dayOfWeek: now.toLocaleDateString("en-GB", { weekday: "long" }),
      hourOfDay: now.getHours(),
      isLocalHoliday: false,
    },
    constraints: {
      minRate: Math.round(baseHourlyRate * MIN_RATE_MULTIPLIER * 100) / 100,
      maxRate: Math.round(baseHourlyRate * MAX_RATE_MULTIPLIER * 100) / 100,
    },
  };
}
