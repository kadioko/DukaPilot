-- Add richer support statuses for shop operations.
ALTER TYPE "OnboardingStatus" ADD VALUE IF NOT EXISTS 'NEEDS_HELP';
ALTER TYPE "OnboardingStatus" ADD VALUE IF NOT EXISTS 'PAID';

-- Record browser offline-sale sync health for merchant/admin visibility.
CREATE TABLE "offline_sync_events" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "deviceId" TEXT,
  "status" TEXT NOT NULL,
  "total" DOUBLE PRECISION,
  "message" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "localId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offline_sync_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "offline_sync_events_shopId_createdAt_idx" ON "offline_sync_events"("shopId", "createdAt");
CREATE INDEX "offline_sync_events_status_createdAt_idx" ON "offline_sync_events"("status", "createdAt");

ALTER TABLE "offline_sync_events" ADD CONSTRAINT "offline_sync_events_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
