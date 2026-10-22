ALTER TABLE "staff_members" ADD COLUMN "canCorrectStock" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "stock_receipts" ADD COLUMN "voidedAt" TIMESTAMP(3);

ALTER TABLE "stock_movements"
  ADD COLUMN "manualAdjustment" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "stockBefore" DOUBLE PRECISION,
  ADD COLUMN "stockAfter" DOUBLE PRECISION,
  ADD COLUMN "reversalOfId" TEXT,
  ADD COLUMN "receiptCorrectionId" TEXT;

CREATE TABLE "stock_receipt_corrections" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "stockReceiptId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "before" JSONB NOT NULL,
  "after" JSONB NOT NULL,
  "recordedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_receipt_corrections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_receipt_corrections_shopId_requestKey_key" ON "stock_receipt_corrections"("shopId", "requestKey");
CREATE INDEX "stock_receipt_corrections_stockReceiptId_createdAt_idx" ON "stock_receipt_corrections"("stockReceiptId", "createdAt");
CREATE UNIQUE INDEX "stock_movements_reversalOfId_key" ON "stock_movements"("reversalOfId");
CREATE INDEX "stock_movements_receiptCorrectionId_idx" ON "stock_movements"("receiptCorrectionId");

ALTER TABLE "stock_receipt_corrections" ADD CONSTRAINT "stock_receipt_corrections_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_receipt_corrections" ADD CONSTRAINT "stock_receipt_corrections_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "stock_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_receiptCorrectionId_fkey" FOREIGN KEY ("receiptCorrectionId") REFERENCES "stock_receipt_corrections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
