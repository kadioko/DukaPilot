ALTER TABLE "products"
ADD COLUMN "createRequestId" TEXT,
ADD COLUMN "createRequestHash" TEXT;

CREATE UNIQUE INDEX "products_shopId_createRequestId_key"
ON "products"("shopId", "createRequestId");
