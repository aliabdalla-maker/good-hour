import { prisma } from "@gihtcx/db";
import type {
  SubmitVerificationInput,
  VerificationDecisionInput,
  VerificationStatusView,
} from "@gihtcx/shared";
import { AppError } from "../../plugins/errorHandler";

function toStatusView(u: {
  verificationStatus: string;
  verificationNote: string | null;
  verifiedAt: Date | null;
}): VerificationStatusView {
  return {
    status: u.verificationStatus as VerificationStatusView["status"],
    note: u.verificationNote,
    verifiedAt: u.verifiedAt ? u.verifiedAt.toISOString() : null,
  };
}

export async function submitVerification(
  userId: string,
  input: SubmitVerificationInput
): Promise<VerificationStatusView> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "User not found", "NOT_FOUND");
  if (user.verificationStatus === "VERIFIED") {
    throw new AppError(409, "You are already verified", "ALREADY_VERIFIED");
  }
  const note = [input.businessName, input.registrationId, input.contactPhone, input.note]
    .filter(Boolean)
    .join(" | ");
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { verificationStatus: "PENDING", verificationNote: note || null },
  });
  return toStatusView(updated);
}

export async function getVerificationStatus(userId: string): Promise<VerificationStatusView> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "User not found", "NOT_FOUND");
  return toStatusView(user);
}

export async function listPendingSuppliers() {
  const users = await prisma.user.findMany({
    where: { verificationStatus: "PENDING" },
    orderBy: { updatedAt: "asc" },
  });
  return users.map((u) => ({
    userId: u.id,
    email: u.email,
    note: u.verificationNote,
    submittedAt: u.updatedAt.toISOString(),
  }));
}

export async function decideVerification(
  targetUserId: string,
  input: VerificationDecisionInput
): Promise<VerificationStatusView> {
  const user = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!user) throw new AppError(404, "User not found", "NOT_FOUND");
  if (user.verificationStatus !== "PENDING") {
    throw new AppError(409, "This supplier is not pending verification", "INVALID_STATE");
  }
  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: {
      verificationStatus: input.approve ? "VERIFIED" : "REJECTED",
      verifiedAt: input.approve ? new Date() : null,
      verificationNote: input.note ?? user.verificationNote,
    },
  });
  return toStatusView(updated);
}
