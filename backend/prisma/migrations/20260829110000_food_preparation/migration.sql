ALTER TABLE "stock_receipts"
  ADD COLUMN "allocationMode" TEXT NOT NULL DEFAULT 'DIRECT',
  ADD COLUMN "estimatedAllocation" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "food_recipes" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "instructions" TEXT,
  "expectedYield" INTEGER NOT NULL,
  "shopId" TEXT NOT NULL,
  "outputProductId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "food_recipes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_recipe_items" (
  "id" TEXT NOT NULL,
  "recipeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "food_recipe_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_preparation_batches" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "recipeId" TEXT,
  "outputProductId" TEXT NOT NULL,
  "expectedYield" INTEGER NOT NULL,
  "actualYield" INTEGER NOT NULL,
  "wasteQuantity" INTEGER NOT NULL DEFAULT 0,
  "ingredientCost" INTEGER NOT NULL,
  "additionalCost" INTEGER NOT NULL DEFAULT 0,
  "totalCost" INTEGER NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "additionalCostNote" TEXT,
  "note" TEXT,
  "preparedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "preparedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "food_preparation_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "food_preparation_items" (
  "id" TEXT NOT NULL,
  "foodPreparationId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "totalCost" INTEGER NOT NULL,
  CONSTRAINT "food_preparation_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "stock_movements" ADD COLUMN "foodPreparationBatchId" TEXT;

CREATE UNIQUE INDEX "food_recipe_items_recipeId_productId_key" ON "food_recipe_items"("recipeId", "productId");
CREATE INDEX "food_recipes_shopId_isActive_updatedAt_idx" ON "food_recipes"("shopId", "isActive", "updatedAt");
CREATE INDEX "food_recipes_shopId_outputProductId_idx" ON "food_recipes"("shopId", "outputProductId");
CREATE INDEX "food_recipe_items_productId_idx" ON "food_recipe_items"("productId");
CREATE INDEX "food_preparation_batches_shopId_preparedAt_idx" ON "food_preparation_batches"("shopId", "preparedAt");
CREATE INDEX "food_preparation_batches_shopId_outputProductId_preparedAt_idx" ON "food_preparation_batches"("shopId", "outputProductId", "preparedAt");
CREATE UNIQUE INDEX "food_preparation_items_foodPreparationId_productId_key" ON "food_preparation_items"("foodPreparationId", "productId");
CREATE INDEX "food_preparation_items_productId_idx" ON "food_preparation_items"("productId");

ALTER TABLE "food_recipes" ADD CONSTRAINT "food_recipes_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_recipes" ADD CONSTRAINT "food_recipes_outputProductId_fkey" FOREIGN KEY ("outputProductId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_recipe_items" ADD CONSTRAINT "food_recipe_items_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "food_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_recipe_items" ADD CONSTRAINT "food_recipe_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "food_preparation_batches" ADD CONSTRAINT "food_preparation_batches_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_preparation_batches" ADD CONSTRAINT "food_preparation_batches_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "food_recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "food_preparation_batches" ADD CONSTRAINT "food_preparation_batches_outputProductId_fkey" FOREIGN KEY ("outputProductId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "food_preparation_items" ADD CONSTRAINT "food_preparation_items_foodPreparationId_fkey" FOREIGN KEY ("foodPreparationId") REFERENCES "food_preparation_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_preparation_items" ADD CONSTRAINT "food_preparation_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_foodPreparationBatchId_fkey" FOREIGN KEY ("foodPreparationBatchId") REFERENCES "food_preparation_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
