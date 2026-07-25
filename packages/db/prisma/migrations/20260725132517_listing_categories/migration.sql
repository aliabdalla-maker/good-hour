-- CreateEnum
CREATE TYPE "ListingCategory" AS ENUM ('ROOM', 'CAR', 'TRAVEL_SERVICE');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "category" "ListingCategory" NOT NULL DEFAULT 'ROOM';
