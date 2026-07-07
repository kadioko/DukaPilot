ALTER TABLE "offline_sync_events" ADD COLUMN "deviceLabel" TEXT;
ALTER TABLE "offline_sync_events" ADD COLUMN "resolutionStatus" TEXT NOT NULL DEFAULT 'OPEN';
ALTER TABLE "offline_sync_events" ADD COLUMN "resolutionNote" TEXT;
ALTER TABLE "offline_sync_events" ADD COLUMN "contactedAt" TIMESTAMP(3);
ALTER TABLE "offline_sync_events" ADD COLUMN "resolvedAt" TIMESTAMP(3);

CREATE INDEX "offline_sync_events_resolutionStatus_createdAt_idx" ON "offline_sync_events"("resolutionStatus", "createdAt");
