-- CreateEnum
CREATE TYPE "CreditEntryKind" AS ENUM ('PURCHASE', 'REDEEM', 'TRANSFER_IN', 'TRANSFER_OUT', 'EXCHANGE_IN', 'EXCHANGE_OUT', 'TRADE_FEE', 'REFUND', 'EXPIRY');

-- CreateEnum
CREATE TYPE "CreditPurchaseStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- AlterEnum
ALTER TYPE "AgentType" ADD VALUE 'EXCHANGE';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "creditHoursRedeemed" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "creditValueApplied" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "credit_ledger_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "ListingCategory" NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    "kind" "CreditEntryKind" NOT NULL,
    "unitValue" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "creditPurchaseId" TEXT,
    "relatedBookingId" TEXT,
    "counterpartyUserId" TEXT,
    "correlationId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_purchases" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "ListingCategory" NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    "unitValue" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "buyerFee" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "stripePaymentIntentId" TEXT,
    "status" "CreditPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "grantedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_ledger_entries_userId_category_idx" ON "credit_ledger_entries"("userId", "category");

-- CreateIndex
CREATE INDEX "credit_ledger_entries_correlationId_idx" ON "credit_ledger_entries"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "credit_purchases_stripePaymentIntentId_key" ON "credit_purchases"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "credit_purchases_userId_status_idx" ON "credit_purchases"("userId", "status");

-- AddForeignKey
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_creditPurchaseId_fkey" FOREIGN KEY ("creditPurchaseId") REFERENCES "credit_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

