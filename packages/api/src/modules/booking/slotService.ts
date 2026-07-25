import { prisma } from "@gihtcx/db";

const SLOT_GENERATION_WINDOW_DAYS = 14;

function hourFloor(date: Date): Date {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

/** Generates hourly OPEN slots for a room from now through the next N days. Idempotent. */
export async function ensureSlotsGenerated(roomId: string, windowDays = SLOT_GENERATION_WINDOW_DAYS) {
  const start = hourFloor(new Date());
  const totalHours = windowDays * 24;

  const existing = await prisma.availabilitySlot.findMany({
    where: { roomId, startsAt: { gte: start } },
    select: { startsAt: true },
  });
  const existingHours = new Set(existing.map((s) => s.startsAt.getTime()));

  const toCreate = [];
  for (let i = 0; i < totalHours; i += 1) {
    const startsAt = new Date(start.getTime() + i * 60 * 60 * 1000);
    if (existingHours.has(startsAt.getTime())) continue;
    toCreate.push({
      roomId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
    });
  }

  if (toCreate.length > 0) {
    await prisma.availabilitySlot.createMany({ data: toCreate, skipDuplicates: true });
  }
}

/** Returns true if every hourly slot in [startsAt, endsAt) is OPEN for this room. */
export async function isRangeFullyOpen(roomId: string, startsAt: Date, endsAt: Date): Promise<boolean> {
  const hours = (endsAt.getTime() - startsAt.getTime()) / (60 * 60 * 1000);
  const slots = await prisma.availabilitySlot.findMany({
    where: { roomId, startsAt: { gte: startsAt, lt: endsAt } },
  });
  return slots.length === hours && slots.every((s) => s.status === "OPEN");
}
