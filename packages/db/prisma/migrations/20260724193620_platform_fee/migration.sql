-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "platformFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "subtotalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "supplierPayout" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill existing bookings: their original totalAmount predates the fee, so
-- treat it as the subtotal and derive the 1% split (0.5% each side) from it.
UPDATE "bookings"
SET "subtotalAmount" = "totalAmount",
    "platformFee"    = ROUND("totalAmount" * 0.01, 2),
    "supplierPayout" = "totalAmount" - ROUND("totalAmount" * 0.005, 2);
