ALTER TABLE "farm_settings"
ADD COLUMN "preferredEggStockMode" TEXT NOT NULL DEFAULT 'EGGS';

ALTER TABLE "farm_settings"
ADD CONSTRAINT "farm_settings_preferredEggStockMode_check"
CHECK ("preferredEggStockMode" IN ('EGGS', 'TRAYS'));

ALTER TABLE "farm_production_batches"
ADD COLUMN "eggStockMode" TEXT NOT NULL DEFAULT 'EGGS';

ALTER TABLE "farm_production_batches"
ADD CONSTRAINT "farm_production_batches_eggStockMode_check"
CHECK ("eggStockMode" IN ('EGGS', 'TRAYS'));

ALTER TABLE "farm_pack_conversions"
ADD COLUMN "farmProductionId" TEXT;

CREATE UNIQUE INDEX "farm_pack_conversions_farmProductionId_key"
ON "farm_pack_conversions"("farmProductionId");

ALTER TABLE "farm_pack_conversions"
ADD CONSTRAINT "farm_pack_conversions_farmProductionId_fkey"
FOREIGN KEY ("farmProductionId") REFERENCES "farm_production_batches"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
