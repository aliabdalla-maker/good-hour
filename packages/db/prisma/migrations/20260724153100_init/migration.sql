-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TRAVELLER', 'SUPPLIER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('OPEN', 'HELD', 'BOOKED');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('DIRECT_SEARCH', 'REVERSE_BID');

-- CreateEnum
CREATE TYPE "RateRuleKind" AS ENUM ('WEEKEND', 'PEAK', 'CORPORATE', 'AI_DYNAMIC');

-- CreateEnum
CREATE TYPE "BookingRequestStatus" AS ENUM ('OPEN', 'MATCHED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupplierOfferStatus" AS ENUM ('PENDING', 'RECOMMENDED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('PRICING', 'NEGOTIATION');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'TRAVELLER',
    "isBusinessAccount" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "amenities" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "amenities" TEXT[],
    "baseHourlyRate" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "minHours" INTEGER NOT NULL DEFAULT 2,
    "maxHours" INTEGER NOT NULL DEFAULT 24,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "autoOfferEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_rate_rules" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "kind" "RateRuleKind" NOT NULL,
    "multiplier" DECIMAL(5,3) NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_rate_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_slots" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'OPEN',
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_requests" (
    "id" TEXT NOT NULL,
    "travellerId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'ROOM',
    "locationQuery" TEXT NOT NULL,
    "desiredStart" TIMESTAMP(3) NOT NULL,
    "desiredEnd" TIMESTAMP(3) NOT NULL,
    "requiredAmenities" TEXT[],
    "maxBudget" DECIMAL(10,2),
    "autoAcceptEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "BookingRequestStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_offers" (
    "id" TEXT NOT NULL,
    "bookingRequestId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "offeredRate" DECIMAL(10,2) NOT NULL,
    "offeredTotal" DECIMAL(10,2) NOT NULL,
    "message" TEXT,
    "isAgentSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "status" "SupplierOfferStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "travellerId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "isCorporateRate" BOOLEAN NOT NULL DEFAULT false,
    "source" "BookingSource" NOT NULL DEFAULT 'DIRECT_SEARCH',
    "sourceOfferId" TEXT,
    "isAgentAccepted" BOOLEAN NOT NULL DEFAULT false,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_decision_logs" (
    "id" TEXT NOT NULL,
    "agentType" "AgentType" NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "rawModelOutput" JSONB NOT NULL,
    "parsedDecision" JSONB NOT NULL,
    "reasoning" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "costEstimateUsd" DECIMAL(10,6),
    "outcomeAccepted" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_decision_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "properties_city_idx" ON "properties"("city");

-- CreateIndex
CREATE INDEX "rooms_propertyId_idx" ON "rooms"("propertyId");

-- CreateIndex
CREATE INDEX "room_rate_rules_roomId_kind_idx" ON "room_rate_rules"("roomId", "kind");

-- CreateIndex
CREATE INDEX "availability_slots_roomId_startsAt_endsAt_idx" ON "availability_slots"("roomId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "availability_slots_roomId_startsAt_key" ON "availability_slots"("roomId", "startsAt");

-- CreateIndex
CREATE INDEX "booking_requests_status_expiresAt_idx" ON "booking_requests"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "supplier_offers_bookingRequestId_status_idx" ON "supplier_offers"("bookingRequestId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_sourceOfferId_key" ON "bookings"("sourceOfferId");

-- CreateIndex
CREATE INDEX "bookings_travellerId_idx" ON "bookings"("travellerId");

-- CreateIndex
CREATE INDEX "bookings_roomId_startsAt_idx" ON "bookings"("roomId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_bookingId_key" ON "payments"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripePaymentIntentId_key" ON "payments"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "agent_decision_logs_agentType_subjectType_subjectId_idx" ON "agent_decision_logs"("agentType", "subjectType", "subjectId");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_rate_rules" ADD CONSTRAINT "room_rate_rules_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_requests" ADD CONSTRAINT "booking_requests_travellerId_fkey" FOREIGN KEY ("travellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_bookingRequestId_fkey" FOREIGN KEY ("bookingRequestId") REFERENCES "booking_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_offers" ADD CONSTRAINT "supplier_offers_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_travellerId_fkey" FOREIGN KEY ("travellerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_sourceOfferId_fkey" FOREIGN KEY ("sourceOfferId") REFERENCES "supplier_offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
