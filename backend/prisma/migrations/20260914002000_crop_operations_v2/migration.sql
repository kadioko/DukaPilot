ALTER TABLE "crop_cycles"
  ADD COLUMN "unrecoveredCost" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "costReconciledAt" TIMESTAMP(3);

ALTER TABLE "crop_input_usages" ADD COLUMN "clientRequestId" TEXT;
ALTER TABLE "crop_harvest_batches" ADD COLUMN "clientRequestId" TEXT;

CREATE TABLE "crop_input_cost_allocations" (
  "id" TEXT NOT NULL,
  "cropInputUsageId" TEXT NOT NULL,
  "harvestBatchId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL DEFAULT 'HARVEST',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crop_input_cost_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crop_season_budgets" (
  "id" TEXT NOT NULL,
  "cropCycleId" TEXT NOT NULL,
  "plannedCost" INTEGER NOT NULL DEFAULT 0,
  "plannedRevenue" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crop_season_budgets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crop_irrigation_logs" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "cropCycleId" TEXT NOT NULL,
  "amount" INTEGER,
  "unit" TEXT,
  "durationMinutes" INTEGER,
  "irrigatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "recordedBy" TEXT,
  "clientRequestId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crop_irrigation_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crop_field_tasks" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "cropCycleId" TEXT,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'TODO',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "assignedStaffId" TEXT,
  "note" TEXT,
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crop_field_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crop_buyer_contracts" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "cropCycleId" TEXT,
  "buyerName" TEXT NOT NULL,
  "buyerPhone" TEXT,
  "produceName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'kg',
  "unitPrice" INTEGER,
  "deliveryAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "note" TEXT,
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crop_buyer_contracts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crop_harvest_grades" (
  "id" TEXT NOT NULL,
  "harvestBatchId" TEXT NOT NULL,
  "grade" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit" TEXT,
  "note" TEXT,
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crop_harvest_grades_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "crop_weather_alerts" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "cropPlotId" TEXT,
  "cropCycleId" TEXT,
  "type" TEXT NOT NULL DEFAULT 'WEATHER',
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "message" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'MANUAL',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "isResolved" BOOLEAN NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMP(3),
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "crop_weather_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crop_input_usages_shopId_clientRequestId_key" ON "crop_input_usages"("shopId", "clientRequestId");
CREATE UNIQUE INDEX "crop_harvest_batches_shopId_clientRequestId_key" ON "crop_harvest_batches"("shopId", "clientRequestId");
CREATE UNIQUE INDEX "crop_input_cost_allocations_cropInputUsageId_harvestBatchId_reason_key" ON "crop_input_cost_allocations"("cropInputUsageId", "harvestBatchId", "reason");
CREATE INDEX "crop_input_cost_allocations_harvestBatchId_idx" ON "crop_input_cost_allocations"("harvestBatchId");
CREATE UNIQUE INDEX "crop_season_budgets_cropCycleId_key" ON "crop_season_budgets"("cropCycleId");
CREATE UNIQUE INDEX "crop_irrigation_logs_shopId_clientRequestId_key" ON "crop_irrigation_logs"("shopId", "clientRequestId");
CREATE INDEX "crop_irrigation_logs_cropCycleId_irrigatedAt_idx" ON "crop_irrigation_logs"("cropCycleId", "irrigatedAt");
CREATE INDEX "crop_field_tasks_shopId_status_dueAt_idx" ON "crop_field_tasks"("shopId", "status", "dueAt");
CREATE INDEX "crop_field_tasks_cropCycleId_status_idx" ON "crop_field_tasks"("cropCycleId", "status");
CREATE INDEX "crop_buyer_contracts_shopId_status_deliveryAt_idx" ON "crop_buyer_contracts"("shopId", "status", "deliveryAt");
CREATE INDEX "crop_buyer_contracts_cropCycleId_idx" ON "crop_buyer_contracts"("cropCycleId");
CREATE UNIQUE INDEX "crop_harvest_grades_harvestBatchId_grade_key" ON "crop_harvest_grades"("harvestBatchId", "grade");
CREATE INDEX "crop_weather_alerts_shopId_isResolved_startsAt_idx" ON "crop_weather_alerts"("shopId", "isResolved", "startsAt");
CREATE INDEX "crop_weather_alerts_cropCycleId_idx" ON "crop_weather_alerts"("cropCycleId");

ALTER TABLE "crop_input_cost_allocations" ADD CONSTRAINT "crop_input_cost_allocations_cropInputUsageId_fkey" FOREIGN KEY ("cropInputUsageId") REFERENCES "crop_input_usages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_input_cost_allocations" ADD CONSTRAINT "crop_input_cost_allocations_harvestBatchId_fkey" FOREIGN KEY ("harvestBatchId") REFERENCES "crop_harvest_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_season_budgets" ADD CONSTRAINT "crop_season_budgets_cropCycleId_fkey" FOREIGN KEY ("cropCycleId") REFERENCES "crop_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_irrigation_logs" ADD CONSTRAINT "crop_irrigation_logs_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_irrigation_logs" ADD CONSTRAINT "crop_irrigation_logs_cropCycleId_fkey" FOREIGN KEY ("cropCycleId") REFERENCES "crop_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_field_tasks" ADD CONSTRAINT "crop_field_tasks_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_field_tasks" ADD CONSTRAINT "crop_field_tasks_cropCycleId_fkey" FOREIGN KEY ("cropCycleId") REFERENCES "crop_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crop_buyer_contracts" ADD CONSTRAINT "crop_buyer_contracts_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_buyer_contracts" ADD CONSTRAINT "crop_buyer_contracts_cropCycleId_fkey" FOREIGN KEY ("cropCycleId") REFERENCES "crop_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crop_harvest_grades" ADD CONSTRAINT "crop_harvest_grades_harvestBatchId_fkey" FOREIGN KEY ("harvestBatchId") REFERENCES "crop_harvest_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_weather_alerts" ADD CONSTRAINT "crop_weather_alerts_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crop_weather_alerts" ADD CONSTRAINT "crop_weather_alerts_cropPlotId_fkey" FOREIGN KEY ("cropPlotId") REFERENCES "crop_plots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "crop_weather_alerts" ADD CONSTRAINT "crop_weather_alerts_cropCycleId_fkey" FOREIGN KEY ("cropCycleId") REFERENCES "crop_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
