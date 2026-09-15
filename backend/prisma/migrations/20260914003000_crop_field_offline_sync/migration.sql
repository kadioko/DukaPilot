ALTER TABLE "offline_sync_events"
  ADD COLUMN "operationKind" TEXT NOT NULL DEFAULT 'SALE';

ALTER TABLE "crop_harvest_grades"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "crop_operation_receipts" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crop_operation_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crop_operation_receipts_shopId_clientRequestId_key"
  ON "crop_operation_receipts"("shopId", "clientRequestId");
CREATE INDEX "crop_operation_receipts_shopId_createdAt_idx"
  ON "crop_operation_receipts"("shopId", "createdAt");
CREATE INDEX "offline_sync_events_shopId_operationKind_createdAt_idx"
  ON "offline_sync_events"("shopId", "operationKind", "createdAt");

ALTER TABLE "crop_operation_receipts"
  ADD CONSTRAINT "crop_operation_receipts_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
