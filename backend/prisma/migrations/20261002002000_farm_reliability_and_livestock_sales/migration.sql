ALTER TYPE "FarmAnimalEventType" ADD VALUE 'SALE';

ALTER TABLE "farm_groups"
  ADD COLUMN "liveProductId" TEXT;

CREATE UNIQUE INDEX "farm_groups_liveProductId_key"
  ON "farm_groups"("liveProductId");

ALTER TABLE "farm_groups"
  ADD CONSTRAINT "farm_groups_liveProductId_fkey"
  FOREIGN KEY ("liveProductId") REFERENCES "products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "farm_animal_events"
  ADD COLUMN "clientRequestId" TEXT,
  ADD COLUMN "saleItemId" TEXT,
  ADD COLUMN "voidedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "farm_animal_events_groupId_clientRequestId_key"
  ON "farm_animal_events"("groupId", "clientRequestId");

CREATE UNIQUE INDEX "farm_animal_events_saleItemId_key"
  ON "farm_animal_events"("saleItemId");

ALTER TABLE "farm_animal_events"
  ADD CONSTRAINT "farm_animal_events_saleItemId_fkey"
  FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "farm_production_batches"
  ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "farm_production_batches_shopId_clientRequestId_key"
  ON "farm_production_batches"("shopId", "clientRequestId");

ALTER TABLE "farm_pack_conversions"
  ADD COLUMN "clientRequestId" TEXT;

CREATE UNIQUE INDEX "farm_pack_conversions_shopId_clientRequestId_key"
  ON "farm_pack_conversions"("shopId", "clientRequestId");
