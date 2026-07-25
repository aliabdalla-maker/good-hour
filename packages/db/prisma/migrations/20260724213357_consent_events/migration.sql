-- CreateTable
CREATE TABLE "consent_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consent_events_userId_createdAt_idx" ON "consent_events"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "consent_events" ADD CONSTRAINT "consent_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
