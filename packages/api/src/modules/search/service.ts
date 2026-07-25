import { prisma } from "@gihtcx/db";
import type { SearchQueryInput, SearchResult } from "@gihtcx/shared";
import { ensureSlotsGenerated, isRangeFullyOpen } from "../booking";
import { getSuggestedRateForRoom } from "../pricing-agent";

function hoursBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (60 * 60 * 1000);
}

export async function searchRooms(query: SearchQueryInput): Promise<SearchResult[]> {
  const startsAt = new Date(query.startsAt);
  const endsAt = new Date(query.endsAt);
  const hours = hoursBetween(startsAt, endsAt);

  // City and category both filter on the parent property, so merge them into
  // one nested filter rather than letting a second spread clobber the first.
  const propertyFilter: Record<string, unknown> = {};
  if (query.city) propertyFilter.city = { equals: query.city, mode: "insensitive" };
  if (query.category) propertyFilter.category = query.category;

  const candidateRooms = await prisma.room.findMany({
    where: {
      status: "ACTIVE",
      capacity: { gte: query.minCapacity },
      minHours: { lte: hours },
      maxHours: { gte: hours },
      ...(Object.keys(propertyFilter).length ? { property: propertyFilter } : {}),
    },
    include: { property: true },
    take: 50,
  });

  const results: SearchResult[] = [];

  for (const room of candidateRooms) {
    await ensureSlotsGenerated(room.id);
    const available = await isRangeFullyOpen(room.id, startsAt, endsAt);
    if (!available) continue;

    const baseHourlyRate = Number(room.baseHourlyRate);
    let aiSuggestedHourlyRate: number | null = null;
    if (query.includeAiPrice) {
      try {
        const decision = await getSuggestedRateForRoom(room.id);
        aiSuggestedHourlyRate = decision.recommendedHourlyRate;
      } catch {
        aiSuggestedHourlyRate = null;
      }
    }

    const effectiveRate = aiSuggestedHourlyRate ?? baseHourlyRate;

    results.push({
      roomId: room.id,
      propertyId: room.propertyId,
      propertyName: room.property.name,
      category: room.property.category,
      city: room.property.city,
      roomName: room.name,
      capacity: room.capacity,
      amenities: room.amenities,
      baseHourlyRate,
      aiSuggestedHourlyRate,
      currency: room.currency,
      hours,
      estimatedTotal: Math.round(effectiveRate * hours * 100) / 100,
    });
  }

  return results;
}
