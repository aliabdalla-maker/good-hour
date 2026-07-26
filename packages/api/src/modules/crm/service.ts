import { prisma } from "@gihtcx/db";
import type {
  AddCrmNoteInput,
  CrmContact,
  CrmContactDetail,
  CrmStage,
  CrmSummary,
  CrmTimelineItem,
  UpdateCrmContactInput,
} from "@gihtcx/shared";
import { AppError } from "../../plugins/errorHandler";

type UserRow = Awaited<ReturnType<typeof prisma.user.findFirst>>;

async function toContact(user: NonNullable<UserRow>): Promise<CrmContact> {
  const [bookingsCount, spend, propertiesCount, notesCount] = await Promise.all([
    prisma.booking.count({ where: { travellerId: user.id } }),
    prisma.booking.aggregate({
      where: { travellerId: user.id, status: { in: ["CONFIRMED", "COMPLETED"] } },
      _sum: { totalAmount: true },
    }),
    prisma.property.count({ where: { supplierId: user.id } }),
    prisma.crmNote.count({ where: { userId: user.id } }),
  ]);
  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    stage: user.crmStage as CrmStage,
    tags: user.crmTags,
    verificationStatus: user.verificationStatus,
    createdAt: user.createdAt.toISOString(),
    lastActivityAt: user.updatedAt.toISOString(),
    bookingsCount,
    totalSpent: Number(spend._sum.totalAmount ?? 0),
    propertiesCount,
    notesCount,
  };
}

/** Contact list + stage breakdown. Uses groupBy so it's a handful of queries. */
export async function getCrmSummary(): Promise<CrmSummary> {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 500 });

  const [spendAgg, bookingCountAgg, propAgg, noteAgg] = await Promise.all([
    prisma.booking.groupBy({
      by: ["travellerId"],
      where: { status: { in: ["CONFIRMED", "COMPLETED"] } },
      _sum: { totalAmount: true },
    }),
    prisma.booking.groupBy({ by: ["travellerId"], _count: { _all: true } }),
    prisma.property.groupBy({ by: ["supplierId"], _count: { _all: true } }),
    prisma.crmNote.groupBy({ by: ["userId"], _count: { _all: true } }),
  ]);
  const spendMap = new Map(spendAgg.map((a) => [a.travellerId, Number(a._sum.totalAmount ?? 0)]));
  const countMap = new Map(bookingCountAgg.map((a) => [a.travellerId, a._count._all]));
  const propMap = new Map(propAgg.map((a) => [a.supplierId, a._count._all]));
  const noteMap = new Map(noteAgg.map((a) => [a.userId, a._count._all]));

  const contacts: CrmContact[] = users.map((u) => ({
    userId: u.id,
    email: u.email,
    role: u.role,
    stage: u.crmStage as CrmStage,
    tags: u.crmTags,
    verificationStatus: u.verificationStatus,
    createdAt: u.createdAt.toISOString(),
    lastActivityAt: u.updatedAt.toISOString(),
    bookingsCount: countMap.get(u.id) ?? 0,
    totalSpent: spendMap.get(u.id) ?? 0,
    propertiesCount: propMap.get(u.id) ?? 0,
    notesCount: noteMap.get(u.id) ?? 0,
  }));

  const byStage = { LEAD: 0, ACTIVE: 0, VIP: 0, DORMANT: 0 } as Record<CrmStage, number>;
  for (const c of contacts) byStage[c.stage] += 1;

  return { total: contacts.length, byStage, contacts };
}

export async function getCrmContact(userId: string): Promise<CrmContactDetail> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "Contact not found", "NOT_FOUND");

  const [contact, notes, bookings, reviews, consents] = await Promise.all([
    toContact(user),
    prisma.crmNote.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.booking.findMany({
      where: { travellerId: userId },
      include: { room: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.review.findMany({
      where: { authorId: userId },
      include: { room: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.consentEvent.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const timeline: CrmTimelineItem[] = [
    { kind: "joined" as const, label: "Joined Good Hours", detail: user.role as string, at: user.createdAt.toISOString() },
    ...bookings.map((b) => ({
      kind: "booking" as const,
      label: `Booked ${b.room.name}`,
      detail: `${b.status} · ${b.currency} ${Number(b.totalAmount).toFixed(2)}`,
      at: b.createdAt.toISOString(),
    })),
    ...reviews.map((r) => ({
      kind: "review" as const,
      label: `Reviewed ${r.room.name}`,
      detail: `${r.rating}★${r.comment ? ` · "${r.comment.slice(0, 60)}"` : ""}`,
      at: r.createdAt.toISOString(),
    })),
    ...consents.map((c) => ({
      kind: "consent" as const,
      label: `Marketing ${c.granted ? "opt-in" : "opt-out"}`,
      detail: c.source,
      at: c.createdAt.toISOString(),
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    contact,
    notes: notes.map((n) => ({ id: n.id, body: n.body, authorId: n.authorId, createdAt: n.createdAt.toISOString() })),
    timeline,
  };
}

export async function updateCrmContact(userId: string, input: UpdateCrmContactInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "Contact not found", "NOT_FOUND");
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.stage ? { crmStage: input.stage } : {}),
      ...(input.tags ? { crmTags: input.tags } : {}),
    },
  });
  return toContact(updated);
}

export async function addCrmNote(userId: string, authorId: string, input: AddCrmNoteInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "Contact not found", "NOT_FOUND");
  const note = await prisma.crmNote.create({ data: { userId, authorId, body: input.body } });
  return { id: note.id, body: note.body, authorId: note.authorId, createdAt: note.createdAt.toISOString() };
}
