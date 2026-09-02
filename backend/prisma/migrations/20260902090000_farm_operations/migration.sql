CREATE TYPE "FarmProfileType" AS ENUM ('LAYERS', 'BROILERS', 'DAIRY', 'BEEF', 'GOATS_SHEEP', 'PIGS', 'MIXED');
CREATE TYPE "FarmAnimalEventType" AS ENUM ('OPENING', 'ADDITION', 'MORTALITY', 'CULL');
CREATE TYPE "FarmProductionType" AS ENUM ('EGGS', 'MILK', 'HARVEST', 'OTHER');

ALTER TABLE "staff_members" ADD COLUMN "canManageFarm" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "farm_profiles" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "type" "FarmProfileType" NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "farm_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "farm_groups" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "profileType" "FarmProfileType" NOT NULL,
  "name" TEXT NOT NULL,
  "currentAnimals" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "farm_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "farm_animal_events" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "type" "FarmAnimalEventType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "note" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "farm_animal_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "farm_production_batches" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "type" "FarmProductionType" NOT NULL DEFAULT 'OTHER',
  "outputProductId" TEXT NOT NULL,
  "expectedYield" INTEGER NOT NULL,
  "actualYield" INTEGER NOT NULL,
  "wasteQuantity" INTEGER NOT NULL DEFAULT 0,
  "ingredientCost" INTEGER NOT NULL,
  "additionalCost" INTEGER NOT NULL DEFAULT 0,
  "totalCost" INTEGER NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "additionalCostNote" TEXT,
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "cashSessionId" TEXT,
  "note" TEXT,
  "producedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "producedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "farm_production_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "farm_production_items" (
  "id" TEXT NOT NULL,
  "farmProductionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "totalCost" INTEGER NOT NULL,
  CONSTRAINT "farm_production_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "farm_pack_conversions" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "inputProductId" TEXT NOT NULL,
  "outputProductId" TEXT NOT NULL,
  "inputQuantity" INTEGER NOT NULL,
  "outputQuantity" INTEGER NOT NULL,
  "totalCost" INTEGER NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "note" TEXT,
  "convertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "convertedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "farm_pack_conversions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "farm_profiles_shopId_type_key" ON "farm_profiles"("shopId", "type");
CREATE INDEX "farm_profiles_shopId_isActive_idx" ON "farm_profiles"("shopId", "isActive");
CREATE INDEX "farm_groups_shopId_profileType_isActive_idx" ON "farm_groups"("shopId", "profileType", "isActive");
CREATE INDEX "farm_groups_shopId_updatedAt_idx" ON "farm_groups"("shopId", "updatedAt");
CREATE INDEX "farm_animal_events_groupId_occurredAt_idx" ON "farm_animal_events"("groupId", "occurredAt");
CREATE INDEX "farm_production_batches_shopId_producedAt_idx" ON "farm_production_batches"("shopId", "producedAt");
CREATE INDEX "farm_production_batches_shopId_outputProductId_producedAt_idx" ON "farm_production_batches"("shopId", "outputProductId", "producedAt");
CREATE INDEX "farm_production_batches_groupId_producedAt_idx" ON "farm_production_batches"("groupId", "producedAt");
CREATE INDEX "farm_production_batches_cashSessionId_paymentMethod_idx" ON "farm_production_batches"("cashSessionId", "paymentMethod");
CREATE UNIQUE INDEX "farm_production_items_farmProductionId_productId_key" ON "farm_production_items"("farmProductionId", "productId");
CREATE INDEX "farm_production_items_productId_idx" ON "farm_production_items"("productId");
CREATE INDEX "farm_pack_conversions_shopId_convertedAt_idx" ON "farm_pack_conversions"("shopId", "convertedAt");
CREATE INDEX "farm_pack_conversions_inputProductId_idx" ON "farm_pack_conversions"("inputProductId");
CREATE INDEX "farm_pack_conversions_outputProductId_idx" ON "farm_pack_conversions"("outputProductId");

ALTER TABLE "farm_profiles" ADD CONSTRAINT "farm_profiles_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "farm_groups" ADD CONSTRAINT "farm_groups_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "farm_animal_events" ADD CONSTRAINT "farm_animal_events_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "farm_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "farm_production_batches" ADD CONSTRAINT "farm_production_batches_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "farm_production_batches" ADD CONSTRAINT "farm_production_batches_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "farm_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farm_production_batches" ADD CONSTRAINT "farm_production_batches_outputProductId_fkey" FOREIGN KEY ("outputProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farm_production_batches" ADD CONSTRAINT "farm_production_batches_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "farm_production_items" ADD CONSTRAINT "farm_production_items_farmProductionId_fkey" FOREIGN KEY ("farmProductionId") REFERENCES "farm_production_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "farm_production_items" ADD CONSTRAINT "farm_production_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farm_pack_conversions" ADD CONSTRAINT "farm_pack_conversions_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "farm_pack_conversions" ADD CONSTRAINT "farm_pack_conversions_inputProductId_fkey" FOREIGN KEY ("inputProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "farm_pack_conversions" ADD CONSTRAINT "farm_pack_conversions_outputProductId_fkey" FOREIGN KEY ("outputProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
