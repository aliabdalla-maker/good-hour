-- CreateEnum
CREATE TYPE "WalletEntryKind" AS ENUM ('TOPUP', 'PURCHASE', 'SALE_PROCEEDS', 'REFUND', 'FEE', 'PAYOUT');

-- CreateEnum
CREATE TYPE "WalletTopUpStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "MarketplaceKind" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "PricingUnit" AS ENUM ('FIXED', 'HOURLY', 'HALF_DAY', 'DAY', 'PROJECT', 'SUBSCRIPTION_MONTH');

-- CreateEnum
CREATE TYPE "MarketplaceListingStatus" AS ENUM ('ACTIVE', 'PAUSED', 'SOLD_OUT');

-- CreateEnum
CREATE TYPE "MarketplaceOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "OrderPaymentMethod" AS ENUM ('WALLET', 'CARD');

-- CreateTable
CREATE TABLE "wallet_ledger_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "kind" "WalletEntryKind" NOT NULL,
    "topUpId" TEXT,
    "relatedOrderId" TEXT,
    "counterpartyUserId" TEXT,
    "correlationId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_top_ups" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "stripePaymentIntentId" TEXT,
    "status" "WalletTopUpStatus" NOT NULL DEFAULT 'PENDING',
    "creditedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_top_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_listings" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "kind" "MarketplaceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "pricingUnit" "PricingUnit" NOT NULL DEFAULT 'FIXED',
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "imageUrl" TEXT,
    "stock" INTEGER,
    "status" "MarketplaceListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_orders" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "buyerFee" DECIMAL(12,2) NOT NULL,
    "sellerFee" DECIMAL(12,2) NOT NULL,
    "platformFee" DECIMAL(12,2) NOT NULL,
    "buyerTotal" DECIMAL(12,2) NOT NULL,
    "sellerProceeds" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "status" "MarketplaceOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentMethod" "OrderPaymentMethod" NOT NULL DEFAULT 'WALLET',
    "stripePaymentIntentId" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_ledger_entries_userId_createdAt_idx" ON "wallet_ledger_entries"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "wallet_ledger_entries_correlationId_idx" ON "wallet_ledger_entries"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_top_ups_stripePaymentIntentId_key" ON "wallet_top_ups"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "wallet_top_ups_userId_status_idx" ON "wallet_top_ups"("userId", "status");

-- CreateIndex
CREATE INDEX "marketplace_listings_kind_status_idx" ON "marketplace_listings"("kind", "status");

-- CreateIndex
CREATE INDEX "marketplace_listings_category_idx" ON "marketplace_listings"("category");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_orders_stripePaymentIntentId_key" ON "marketplace_orders"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "marketplace_orders_buyerId_createdAt_idx" ON "marketplace_orders"("buyerId", "createdAt");

-- CreateIndex
CREATE INDEX "marketplace_orders_sellerId_createdAt_idx" ON "marketplace_orders"("sellerId", "createdAt");

-- AddForeignKey
ALTER TABLE "wallet_ledger_entries" ADD CONSTRAINT "wallet_ledger_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_ledger_entries" ADD CONSTRAINT "wallet_ledger_entries_topUpId_fkey" FOREIGN KEY ("topUpId") REFERENCES "wallet_top_ups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_top_ups" ADD CONSTRAINT "wallet_top_ups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "marketplace_listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

