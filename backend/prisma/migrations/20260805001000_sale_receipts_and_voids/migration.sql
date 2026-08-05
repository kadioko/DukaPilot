ALTER TABLE "shops"
  ADD COLUMN "nextSaleNumber" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "sales"
  ADD COLUMN "receiptNumber" INTEGER,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT,
  ADD COLUMN "voidedBy" TEXT;

CREATE UNIQUE INDEX "sales_shopId_receiptNumber_key" ON "sales"("shopId", "receiptNumber");
CREATE INDEX "sales_shopId_status_createdAt_idx" ON "sales"("shopId", "status", "createdAt");
