CREATE TABLE "farm_settings" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "hasLivestock" BOOLEAN NOT NULL DEFAULT false,
  "hasCrops" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "farm_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crop_plots" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "location" TEXT,
  "areaMilli" INTEGER NOT NULL DEFAULT 0,
  "areaUnit" TEXT NOT NULL DEFAULT 'ACRE',
  "note" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crop_plots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crop_cycles" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "plotId" TEXT NOT NULL,
  "cropName" TEXT NOT NULL,
  "variety" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PLANTED',
  "plantedAt" TIMESTAMP(3) NOT NULL,
  "expectedHarvestAt" TIMESTAMP(3),
  "expectedYield" INTEGER,
  "yieldUnit" TEXT,
  "note" TEXT,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crop_cycles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crop_input_usages" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "cropCycleId" TEXT NOT NULL,
  "productId" TEXT,
  "category" TEXT NOT NULL DEFAULT 'OTHER',
  "title" TEXT NOT NULL,
  "quantity" INTEGER,
  "unitCost" INTEGER,
  "totalCost" INTEGER NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "cashSessionId" TEXT,
  "note" TEXT,
  "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crop_input_usages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crop_harvest_batches" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "cropCycleId" TEXT NOT NULL,
  "outputProductId" TEXT NOT NULL,
  "expectedYield" INTEGER,
  "actualYield" INTEGER NOT NULL,
  "wasteQuantity" INTEGER NOT NULL DEFAULT 0,
  "totalCost" INTEGER NOT NULL DEFAULT 0,
  "unitCost" INTEGER NOT NULL DEFAULT 0,
  "remainingQuantity" INTEGER NOT NULL,
  "remainingCost" INTEGER NOT NULL DEFAULT 0,
  "soldQuantity" INTEGER NOT NULL DEFAULT 0,
  "realizedRevenue" INTEGER NOT NULL DEFAULT 0,
  "realizedCost" INTEGER NOT NULL DEFAULT 0,
  "harvestAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crop_harvest_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crop_harvest_allocations" (
  "id" TEXT NOT NULL,
  "harvestBatchId" TEXT NOT NULL,
  "saleItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "revenue" INTEGER NOT NULL,
  "cost" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crop_harvest_allocations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "stock_movements" ADD COLUMN "cropHarvestBatchId" TEXT;

CREATE UNIQUE INDEX "farm_settings_shopId_key" ON "farm_settings"("shopId");
CREATE INDEX "crop_plots_shopId_isActive_updatedAt_idx" ON "crop_plots"("shopId", "isActive", "updatedAt");
CREATE INDEX "crop_cycles_shopId_status_expectedHarvestAt_idx" ON "crop_cycles"("shopId", "status", "expectedHarvestAt");
CREATE INDEX "crop_cycles_plotId_plantedAt_idx" ON "crop_cycles"("plotId", "plantedAt");
CREATE INDEX "crop_input_usages_shopId_usedAt_idx" ON "crop_input_usages"("shopId", "usedAt");
CREATE INDEX "crop_input_usages_cropCycleId_usedAt_idx" ON "crop_input_usages"("cropCycleId", "usedAt");
CREATE INDEX "crop_input_usages_productId_idx" ON "crop_input_usages"("productId");
CREATE INDEX "crop_input_usages_cashSessionId_paymentMethod_idx" ON "crop_input_usages"("cashSessionId", "paymentMethod");
CREATE INDEX "crop_harvest_batches_shopId_outputProductId_harvestAt_idx" ON "crop_harvest_batches"("shopId", "outputProductId", "harvestAt");
CREATE INDEX "crop_harvest_batches_cropCycleId_harvestAt_idx" ON "crop_harvest_batches"("cropCycleId", "harvestAt");
CREATE UNIQUE INDEX "crop_harvest_allocations_harvestBatchId_saleItemId_key" ON "crop_harvest_allocations"("harvestBatchId", "saleItemId");
CREATE INDEX "crop_harvest_allocations_saleItemId_idx" ON "crop_harvest_allocations"("saleItemId");

ALTER TABLE "farm_settings" ADD CONSTRAINT "farm_settings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_plots" ADD CONSTRAINT "crop_plots_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_plotId_fkey" FOREIGN KEY ("plotId") REFERENCES "crop_plots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crop_input_usages" ADD CONSTRAINT "crop_input_usages_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_input_usages" ADD CONSTRAINT "crop_input_usages_cropCycleId_fkey" FOREIGN KEY ("cropCycleId") REFERENCES "crop_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_input_usages" ADD CONSTRAINT "crop_input_usages_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crop_input_usages" ADD CONSTRAINT "crop_input_usages_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crop_harvest_batches" ADD CONSTRAINT "crop_harvest_batches_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_harvest_batches" ADD CONSTRAINT "crop_harvest_batches_cropCycleId_fkey" FOREIGN KEY ("cropCycleId") REFERENCES "crop_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_harvest_batches" ADD CONSTRAINT "crop_harvest_batches_outputProductId_fkey" FOREIGN KEY ("outputProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crop_harvest_allocations" ADD CONSTRAINT "crop_harvest_allocations_harvestBatchId_fkey" FOREIGN KEY ("harvestBatchId") REFERENCES "crop_harvest_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_harvest_allocations" ADD CONSTRAINT "crop_harvest_allocations_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_cropHarvestBatchId_fkey" FOREIGN KEY ("cropHarvestBatchId") REFERENCES "crop_harvest_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
