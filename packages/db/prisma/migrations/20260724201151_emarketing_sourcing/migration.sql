-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('TRANSACTIONAL', 'MARKETING');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "SourcedDraftStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "SourcedDraftOrigin" AS ENUM ('URL', 'FEED', 'MANUAL');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "marketingOptIn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "category" "NotificationCategory" NOT NULL DEFAULT 'TRANSACTIONAL',
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "providerRef" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sourced_listing_drafts" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "origin" "SourcedDraftOrigin" NOT NULL,
    "sourceUrl" TEXT,
    "status" "SourcedDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "addressLine" TEXT,
    "city" TEXT,
    "country" TEXT,
    "amenities" TEXT[],
    "suggestedHourlyRate" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "rawExtract" JSONB,
    "publishedPropertyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sourced_listing_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "sourced_listing_drafts_supplierId_status_idx" ON "sourced_listing_drafts"("supplierId", "status");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sourced_listing_drafts" ADD CONSTRAINT "sourced_listing_drafts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
