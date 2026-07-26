import { prisma } from "@gihtcx/db";
import type { CreateMessageInput, MessagePublic } from "@gihtcx/shared";
import { AppError } from "../../plugins/errorHandler";

async function loadParties(bookingId: string) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { room: { include: { property: { select: { supplierId: true } } } } },
  });
  if (!booking) throw new AppError(404, "Booking not found", "NOT_FOUND");
  return { travellerId: booking.travellerId, hostId: booking.room.property.supplierId };
}

function partyRole(
  userId: string,
  parties: { travellerId: string; hostId: string }
): "traveller" | "host" | null {
  if (userId === parties.travellerId) return "traveller";
  if (userId === parties.hostId) return "host";
  return null;
}

function maskName(email: string): string {
  return (email.split("@")[0] || "user").charAt(0).toUpperCase() + ".";
}

function toPublic(
  m: { id: string; bookingId: string; body: string; senderId: string; createdAt: Date; sender: { email: string } },
  viewerId: string,
  senderRole: "traveller" | "host"
): MessagePublic {
  return {
    id: m.id,
    bookingId: m.bookingId,
    body: m.body,
    senderRole,
    senderName: maskName(m.sender.email),
    createdAt: m.createdAt.toISOString(),
    mine: m.senderId === viewerId,
  };
}

export async function sendMessage(userId: string, input: CreateMessageInput): Promise<MessagePublic> {
  const parties = await loadParties(input.bookingId);
  const role = partyRole(userId, parties);
  if (!role) throw new AppError(403, "You are not a party to this booking", "FORBIDDEN");
  const msg = await prisma.message.create({
    data: { bookingId: input.bookingId, senderId: userId, body: input.body },
    include: { sender: true },
  });
  return toPublic(msg, userId, role);
}

export async function listMessages(userId: string, bookingId: string): Promise<MessagePublic[]> {
  const parties = await loadParties(bookingId);
  if (!partyRole(userId, parties)) {
    throw new AppError(403, "You are not a party to this booking", "FORBIDDEN");
  }
  const msgs = await prisma.message.findMany({
    where: { bookingId },
    include: { sender: true },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  return msgs.map((m) =>
    toPublic(m, userId, m.senderId === parties.travellerId ? "traveller" : "host")
  );
}
