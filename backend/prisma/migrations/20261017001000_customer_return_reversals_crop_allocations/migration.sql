ALTER TYPE "FarmAnimalEventType" ADD VALUE 'RETURN_REVERSAL';

CREATE TABLE "sale_return_reversals" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "saleReturnId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "totalAmount" INTEGER NOT NULL,
  "debtRestored" INTEGER NOT NULL DEFAULT 0,
  "refundRecoveredAmount" INTEGER NOT NULL DEFAULT 0,
  "recoveryMethod" "PaymentMethod",
  "paymentRef" TEXT,
  "requestKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "recordedBy" TEXT,
  "cashSessionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_return_reversals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_return_reversals_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_return_reversals_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "sale_returns"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_return_reversals_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "sale_return_reversals_amounts_check" CHECK ("totalAmount" >= 0 AND "debtRestored" >= 0 AND "refundRecoveredAmount" >= 0 AND "debtRestored" + "refundRecoveredAmount" = "totalAmount")
);

CREATE TABLE "sale_return_item_reversals" (
  "id" TEXT NOT NULL,
  "reversalId" TEXT NOT NULL,
  "saleReturnItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "restockQuantity" INTEGER NOT NULL,
  "damagedQuantity" INTEGER NOT NULL,
  "totalAmount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_return_item_reversals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sale_return_item_reversals_reversalId_fkey" FOREIGN KEY ("reversalId") REFERENCES "sale_return_reversals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sale_return_item_reversals_saleReturnItemId_fkey" FOREIGN KEY ("saleReturnItemId") REFERENCES "sale_return_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "sale_return_item_reversals_quantities_check" CHECK ("quantity" > 0 AND "restockQuantity" >= 0 AND "damagedQuantity" >= 0 AND "restockQuantity" + "damagedQuantity" = "quantity" AND "totalAmount" >= 0)
);

CREATE TABLE "crop_harvest_return_allocations" (
  "id" TEXT NOT NULL,
  "saleReturnItemId" TEXT NOT NULL,
  "cropHarvestAllocationId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "restockQuantity" INTEGER NOT NULL,
  "damagedQuantity" INTEGER NOT NULL,
  "revenue" INTEGER NOT NULL,
  "costRestored" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crop_harvest_return_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crop_harvest_return_allocations_saleReturnItemId_fkey" FOREIGN KEY ("saleReturnItemId") REFERENCES "sale_return_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "crop_harvest_return_allocations_cropHarvestAllocationId_fkey" FOREIGN KEY ("cropHarvestAllocationId") REFERENCES "crop_harvest_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "crop_harvest_return_allocations_values_check" CHECK ("quantity" > 0 AND "restockQuantity" >= 0 AND "damagedQuantity" >= 0 AND "restockQuantity" + "damagedQuantity" = "quantity" AND "revenue" >= 0 AND "costRestored" >= 0)
);

CREATE TABLE "crop_harvest_return_allocation_reversals" (
  "id" TEXT NOT NULL,
  "saleReturnItemReversalId" TEXT NOT NULL,
  "cropHarvestReturnAllocationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crop_harvest_return_allocation_reversals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "crop_harvest_return_allocation_reversals_item_fkey" FOREIGN KEY ("saleReturnItemReversalId") REFERENCES "sale_return_item_reversals"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "crop_harvest_return_allocation_reversals_allocation_fkey" FOREIGN KEY ("cropHarvestReturnAllocationId") REFERENCES "crop_harvest_return_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "stock_movements"
  ADD COLUMN "saleReturnReversalItemId" TEXT,
  ADD CONSTRAINT "stock_movements_saleReturnReversalItemId_fkey" FOREIGN KEY ("saleReturnReversalItemId") REFERENCES "sale_return_item_reversals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "farm_animal_events"
  ADD COLUMN "saleReturnReversalItemId" TEXT,
  ADD CONSTRAINT "farm_animal_events_saleReturnReversalItemId_fkey" FOREIGN KEY ("saleReturnReversalItemId") REFERENCES "sale_return_item_reversals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "sale_return_reversals_saleReturnId_key" ON "sale_return_reversals"("saleReturnId");
CREATE UNIQUE INDEX "sale_return_reversals_shopId_requestKey_key" ON "sale_return_reversals"("shopId", "requestKey");
CREATE INDEX "sale_return_reversals_shopId_createdAt_idx" ON "sale_return_reversals"("shopId", "createdAt");
CREATE INDEX "sale_return_reversals_cashSessionId_recoveryMethod_idx" ON "sale_return_reversals"("cashSessionId", "recoveryMethod");
CREATE UNIQUE INDEX "sale_return_item_reversals_saleReturnItemId_key" ON "sale_return_item_reversals"("saleReturnItemId");
CREATE UNIQUE INDEX "sale_return_item_reversals_reversalId_saleReturnItemId_key" ON "sale_return_item_reversals"("reversalId", "saleReturnItemId");
CREATE INDEX "sale_return_item_reversals_reversalId_idx" ON "sale_return_item_reversals"("reversalId");
CREATE UNIQUE INDEX "crop_harvest_return_allocations_saleReturnItemId_cropHarvestAllocationId_key" ON "crop_harvest_return_allocations"("saleReturnItemId", "cropHarvestAllocationId");
CREATE INDEX "crop_harvest_return_allocations_cropHarvestAllocationId_idx" ON "crop_harvest_return_allocations"("cropHarvestAllocationId");
CREATE UNIQUE INDEX "crop_harvest_return_allocation_reversals_cropHarvestReturnAllocationId_key" ON "crop_harvest_return_allocation_reversals"("cropHarvestReturnAllocationId");
CREATE INDEX "crop_harvest_return_allocation_reversals_saleReturnItemReversalId_idx" ON "crop_harvest_return_allocation_reversals"("saleReturnItemReversalId");
CREATE UNIQUE INDEX "stock_movements_saleReturnReversalItemId_key" ON "stock_movements"("saleReturnReversalItemId");
CREATE UNIQUE INDEX "farm_animal_events_saleReturnReversalItemId_key" ON "farm_animal_events"("saleReturnReversalItemId");

DO $$
DECLARE
  returned RECORD;
  allocation RECORD;
  units_to_allocate INTEGER;
  units_left INTEGER;
  damage_amount INTEGER;
  amount_left INTEGER;
  allocated_revenue INTEGER;
BEGIN
  FOR returned IN
    SELECT sri."id", sri."saleItemId", sri."quantity", sri."damagedQuantity", sri."totalAmount", sr."shopId"
    FROM "sale_return_items" sri
    JOIN "sale_returns" sr ON sr."id" = sri."saleReturnId"
    WHERE sri."damagedQuantity" > 0
    ORDER BY sr."createdAt", sri."id"
  LOOP
    units_left := returned."damagedQuantity";
    damage_amount := FLOOR(returned."totalAmount"::numeric * returned."damagedQuantity" / NULLIF(returned."quantity", 0))::integer;
    amount_left := damage_amount;

    FOR allocation IN
      SELECT cha."id", cha."harvestBatchId", cha."quantity", cha."revenue",
             GREATEST(0, cha."quantity" - COALESCE(SUM(cra."quantity"), 0))::integer AS available_quantity,
             GREATEST(0, cha."revenue" - COALESCE(SUM(cra."revenue"), 0))::integer AS available_revenue,
             chb."soldQuantity", chb."realizedRevenue"
      FROM "crop_harvest_allocations" cha
      JOIN "crop_harvest_batches" chb ON chb."id" = cha."harvestBatchId"
      LEFT JOIN "crop_harvest_return_allocations" cra ON cra."cropHarvestAllocationId" = cha."id"
      LEFT JOIN "crop_harvest_return_allocation_reversals" crar ON crar."cropHarvestReturnAllocationId" = cra."id"
      WHERE cha."saleItemId" = returned."saleItemId"
      GROUP BY cha."id", cha."harvestBatchId", cha."quantity", cha."revenue", chb."soldQuantity", chb."realizedRevenue", cha."createdAt"
      HAVING cha."quantity" - COALESCE(SUM(cra."quantity") FILTER (WHERE crar."id" IS NULL), 0) > 0
      ORDER BY cha."createdAt", cha."id"
    LOOP
      EXIT WHEN units_left <= 0;
      units_to_allocate := LEAST(units_left, allocation.available_quantity);
      units_to_allocate := LEAST(units_to_allocate, allocation."soldQuantity");
      IF units_to_allocate <= 0 THEN
        CONTINUE;
      END IF;
      IF units_to_allocate = units_left THEN
        allocated_revenue := LEAST(amount_left, allocation.available_revenue, allocation."realizedRevenue");
      ELSE
        allocated_revenue := LEAST(
          FLOOR(damage_amount::numeric * units_to_allocate / returned."damagedQuantity")::integer,
          allocation.available_revenue,
          allocation."realizedRevenue"
        );
      END IF;

      INSERT INTO "crop_harvest_return_allocations" (
        "id", "saleReturnItemId", "cropHarvestAllocationId", "quantity", "restockQuantity", "damagedQuantity", "revenue", "costRestored", "createdAt"
      ) VALUES (
        'chra_backfill_' || md5(returned."id" || ':' || allocation."id"), returned."id", allocation."id",
        units_to_allocate, 0, units_to_allocate, allocated_revenue, 0, CURRENT_TIMESTAMP
      );

      UPDATE "crop_harvest_batches"
      SET "soldQuantity" = "soldQuantity" - units_to_allocate,
          "realizedRevenue" = "realizedRevenue" - allocated_revenue
      WHERE "id" = allocation."harvestBatchId"
        AND "soldQuantity" >= units_to_allocate
        AND "realizedRevenue" >= allocated_revenue;

      units_left := units_left - units_to_allocate;
      amount_left := GREATEST(0, amount_left - allocated_revenue);
    END LOOP;
  END LOOP;
END $$;
