ALTER TABLE "stock_movements"
ADD COLUMN "requestKey" TEXT,
ADD COLUMN "requestHash" TEXT;

CREATE UNIQUE INDEX "stock_movements_productId_requestKey_key"
ON "stock_movements"("productId", "requestKey");
