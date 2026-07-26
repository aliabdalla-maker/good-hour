import { prisma } from "@gihtcx/db";
import type { CreateReviewInput, ReviewPublic } from "@gihtcx/shared";
import { AppError } from "../../plugins/errorHandler";

// Privacy: never expose the reviewer's email — only a masked initial.
function maskAuthor(email: string): string {
  const local = email.split("@")[0] || "guest";
  return `${local.charAt(0).toUpperCase()}.`;
}

function toPublicReview(r: {
  id: string;
  roomId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  author: { email: string };
}): ReviewPublic {
  return {
    id: r.id,
    roomId: r.roomId,
    rating: r.rating,
    comment: r.comment,
    authorName: maskAuthor(r.author.email),
    createdAt: r.createdAt.toISOString(),
  };
}

/**
 * Create a verified review: the author must own the booking, it must have been
 * paid for (CONFIRMED/COMPLETED), and each booking can be reviewed only once
 * (enforced by the unique bookingId) so ratings can't be stuffed.
 */
export async function createReview(authorId: string, input: CreateReviewInput): Promise<ReviewPublic> {
  const booking = await prisma.booking.findUnique({ where: { id: input.bookingId } });
  if (!booking || booking.travellerId !== authorId) {
    throw new AppError(404, "Booking not found", "NOT_FOUND");
  }
  if (booking.status !== "CONFIRMED" && booking.status !== "COMPLETED") {
    throw new AppError(409, "You can only review a confirmed or completed booking", "INVALID_STATE");
  }
  const existing = await prisma.review.findUnique({ where: { bookingId: input.bookingId } });
  if (existing) {
    throw new AppError(409, "This booking has already been reviewed", "ALREADY_REVIEWED");
  }

  const review = await prisma.review.create({
    data: {
      bookingId: input.bookingId,
      authorId,
      roomId: booking.roomId,
      rating: input.rating,
      comment: input.comment ?? null,
    },
    include: { author: true },
  });
  return toPublicReview(review);
}

/**
 * Average rating (rounded to 1dp) across every review left for any room under
 * this supplier's properties, or null if they have none yet. Feeds the
 * negotiation agent's `supplierRatingAvg` signal (see offerEvaluation.processor.ts).
 */
export async function getSupplierRatingAvg(supplierId: string): Promise<number | null> {
  const result = await prisma.review.aggregate({
    where: { room: { property: { supplierId } } },
    _avg: { rating: true },
  });
  return result._avg.rating != null ? Math.round(result._avg.rating * 10) / 10 : null;
}

export async function listReviewsForRoom(roomId: string): Promise<ReviewPublic[]> {
  const reviews = await prisma.review.findMany({
    where: { roomId },
    include: { author: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return reviews.map(toPublicReview);
}

/** Average rating (rounded to 1dp) and count per room, for a set of room ids. */
export async function getRoomRatings(
  roomIds: string[]
): Promise<Map<string, { avgRating: number | null; reviewCount: number }>> {
  const map = new Map<string, { avgRating: number | null; reviewCount: number }>();
  if (roomIds.length === 0) return map;
  const groups = await prisma.review.groupBy({
    by: ["roomId"],
    where: { roomId: { in: roomIds } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  for (const g of groups) {
    map.set(g.roomId, {
      avgRating: g._avg.rating != null ? Math.round(g._avg.rating * 10) / 10 : null,
      reviewCount: g._count._all,
    });
  }
  return map;
}
