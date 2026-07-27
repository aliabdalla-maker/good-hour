import { prisma } from "@gihtcx/db";
import type { CreatePropertyInput, CreateRoomInput } from "@gihtcx/shared";
import { AppError } from "../../plugins/errorHandler";
import { pricingRefreshQueue } from "../../queue/queues";

const PRICING_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

export async function createProperty(supplierId: string, input: CreatePropertyInput) {
  return prisma.property.create({
    data: {
      supplierId,
      name: input.name,
      category: input.category,
      addressLine: input.addressLine,
      city: input.city,
      country: input.country,
      lat: input.lat,
      lng: input.lng,
      amenities: input.amenities,
    },
  });
}

export async function listPropertiesForSupplier(supplierId: string) {
  return prisma.property.findMany({
    where: { supplierId },
    include: { rooms: true, supplier: { select: { verificationStatus: true } } },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Public catalogue of everything bookable on the platform: every property
 * that has at least one ACTIVE room, with those rooms attached (cheapest
 * first). Unlike search, this is not filtered by time/availability — it's
 * the "browse all products" view.
 */
export async function listPublicCatalog() {
  return prisma.property.findMany({
    where: { rooms: { some: { status: "ACTIVE" } } },
    include: {
      rooms: { where: { status: "ACTIVE" }, orderBy: { baseHourlyRate: "asc" } },
      supplier: { select: { verificationStatus: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createRoom(supplierId: string, input: CreateRoomInput) {
  const property = await prisma.property.findUnique({ where: { id: input.propertyId } });
  if (!property || property.supplierId !== supplierId) {
    throw new AppError(404, "Property not found", "NOT_FOUND");
  }
  if (input.minHours > input.maxHours) {
    throw new AppError(400, "minHours cannot exceed maxHours", "INVALID_HOURS");
  }

  const room = await prisma.room.create({
    data: {
      propertyId: input.propertyId,
      name: input.name,
      capacity: input.capacity,
      amenities: input.amenities,
      imageUrl: input.imageUrl,
      imageIsAiGenerated: input.imageIsAiGenerated,
      baseHourlyRate: input.baseHourlyRate,
      currency: input.currency,
      minHours: input.minHours,
      maxHours: input.maxHours,
      autoOfferEnabled: input.autoOfferEnabled,
    },
  });

  // Periodic AI re-pricing (Phase 3): refreshes the cached AI_DYNAMIC rate
  // so the synchronous room-detail path usually reads a fresh recommendation
  // instead of calling the LLM live on every page view.
  await pricingRefreshQueue.add(
    "refresh",
    { roomId: room.id },
    { repeat: { every: PRICING_REFRESH_INTERVAL_MS }, jobId: `pricing-refresh-${room.id}` }
  );

  return room;
}

export async function getRoomById(roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { property: { include: { supplier: { select: { verificationStatus: true } } } } },
  });
  if (!room) {
    throw new AppError(404, "Room not found", "NOT_FOUND");
  }
  return room;
}

export function toPublicProperty(
  property: {
    id: string;
    name: string;
    category: string;
    addressLine: string;
    city: string;
    country: string;
    lat: number;
    lng: number;
    amenities: string[];
    supplier?: { verificationStatus: string } | null;
  },
  hostVerified = property.supplier?.verificationStatus === "VERIFIED"
) {
  return {
    id: property.id,
    name: property.name,
    category: property.category as "ROOM" | "CAR" | "TRAVEL_SERVICE",
    hostVerified,
    addressLine: property.addressLine,
    city: property.city,
    country: property.country,
    lat: property.lat,
    lng: property.lng,
    amenities: property.amenities,
  };
}

export function toPublicRoom(
  room: {
    id: string;
    propertyId: string;
    name: string;
    capacity: number;
    amenities: string[];
    imageUrl?: string | null;
    imageIsAiGenerated?: boolean;
    baseHourlyRate: unknown;
    currency: string;
    minHours: number;
    maxHours: number;
    status: string;
    autoOfferEnabled: boolean;
  },
  rating?: { avgRating: number | null; reviewCount: number }
) {
  return {
    id: room.id,
    propertyId: room.propertyId,
    name: room.name,
    capacity: room.capacity,
    amenities: room.amenities,
    imageUrl: room.imageUrl ?? null,
    imageIsAiGenerated: room.imageIsAiGenerated ?? false,
    baseHourlyRate: Number(room.baseHourlyRate),
    currency: room.currency,
    minHours: room.minHours,
    maxHours: room.maxHours,
    status: room.status,
    autoOfferEnabled: room.autoOfferEnabled,
    avgRating: rating?.avgRating ?? null,
    reviewCount: rating?.reviewCount ?? 0,
  };
}
