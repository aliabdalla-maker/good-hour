-- CreateEnum
CREATE TYPE "AuctionKind" AS ENUM ('FORWARD', 'REVERSE');

-- CreateEnum
CREATE TYPE "AuctionStatus" AS ENUM ('OPEN', 'CLOSED', 'SETTLED', 'UNMET', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuctionBidStatus" AS ENUM ('ACTIVE', 'OUTBID', 'WON', 'LOST', 'WITHDRAWN');

-- AlterEnum
ALTER TYPE "AgentType" ADD VALUE 'AUCTION';

-- CreateTable
CREATE TABLE "marketplace_auctions" (
    "id" TEXT NOT NULL,
    "kind" "AuctionKind" NOT NULL,
    "createdById" TEXT NOT NULL,
    "listingId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    "reservePerHour" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "closesAt" TIMESTAMP(3) NOT NULL,
    "status" "AuctionStatus" NOT NULL DEFAULT 'OPEN',
    "winningBidId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_auctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auction_bids" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amountPerHour" DECIMAL(12,2) NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "maxPerHour" DECIMAL(12,2),
    "isAgentPlaced" BOOLEAN NOT NULL DEFAULT false,
    "autoSettle" BOOLEAN NOT NULL DEFAULT false,
    "status" "AuctionBidStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auction_bids_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_auctions_winningBidId_key" ON "marketplace_auctions"("winningBidId");

-- CreateIndex
CREATE INDEX "marketplace_auctions_status_closesAt_idx" ON "marketplace_auctions"("status", "closesAt");

-- CreateIndex
CREATE INDEX "marketplace_auctions_kind_status_idx" ON "marketplace_auctions"("kind", "status");

-- CreateIndex
CREATE INDEX "auction_bids_auctionId_amountPerHour_idx" ON "auction_bids"("auctionId", "amountPerHour");

-- CreateIndex
CREATE INDEX "auction_bids_bidderId_createdAt_idx" ON "auction_bids"("bidderId", "createdAt");

-- AddForeignKey
ALTER TABLE "marketplace_auctions" ADD CONSTRAINT "marketplace_auctions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_auctions" ADD CONSTRAINT "marketplace_auctions_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "marketplace_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "marketplace_auctions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auction_bids" ADD CONSTRAINT "auction_bids_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

