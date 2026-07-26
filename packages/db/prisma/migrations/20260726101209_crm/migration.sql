-- CreateEnum
CREATE TYPE "CrmStage" AS ENUM ('LEAD', 'ACTIVE', 'VIP', 'DORMANT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "crmStage" "CrmStage" NOT NULL DEFAULT 'LEAD',
ADD COLUMN     "crmTags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "crm_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_notes_userId_createdAt_idx" ON "crm_notes"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
