ALTER TABLE "shops"
ADD COLUMN "hiddenMenuItems" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "farm_production_batches"
ADD COLUMN "brokenQuantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "farm_production_batches"
ADD CONSTRAINT "farm_production_batches_brokenQuantity_check"
CHECK ("brokenQuantity" >= 0 AND "brokenQuantity" <= "actualYield");

ALTER TABLE "products"
ALTER COLUMN "currentStock" TYPE DOUBLE PRECISION USING "currentStock"::DOUBLE PRECISION;

ALTER TABLE "stock_movements"
ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::DOUBLE PRECISION;

ALTER TABLE "stock_count_items"
ALTER COLUMN "expected" TYPE DOUBLE PRECISION USING "expected"::DOUBLE PRECISION,
ALTER COLUMN "counted" TYPE DOUBLE PRECISION USING "counted"::DOUBLE PRECISION;

ALTER TABLE "farm_production_items"
ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::DOUBLE PRECISION;
