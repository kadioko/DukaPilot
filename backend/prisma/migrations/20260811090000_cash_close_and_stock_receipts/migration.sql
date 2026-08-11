CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "cash_sessions" (
  "id" TEXT NOT NULL,
  "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
  "openingCash" INTEGER NOT NULL DEFAULT 0,
  "expectedCash" INTEGER,
  "countedCash" INTEGER,
  "variance" INTEGER,
  "note" TEXT,
  "openedById" TEXT NOT NULL,
  "openedByName" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "shopId" TEXT NOT NULL,
  CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cash_sessions_shopId_status_openedAt_idx" ON "cash_sessions"("shopId", "status", "openedAt");
CREATE INDEX "cash_sessions_shopId_openedById_status_idx" ON "cash_sessions"("shopId", "openedById", "status");

ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "stock_receipts" (
  "id" TEXT NOT NULL,
  "invoiceNumber" TEXT,
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "transportCost" INTEGER NOT NULL DEFAULT 0,
  "otherCost" INTEGER NOT NULL DEFAULT 0,
  "totalProductCost" INTEGER NOT NULL,
  "totalLandedCost" INTEGER NOT NULL,
  "note" TEXT,
  "receivedBy" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "shopId" TEXT NOT NULL,
  "supplierId" TEXT,
  "sourceOrderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_receipts_sourceOrderId_key" ON "stock_receipts"("sourceOrderId");
CREATE INDEX "stock_receipts_shopId_receivedAt_idx" ON "stock_receipts"("shopId", "receivedAt");
CREATE INDEX "stock_receipts_supplierId_receivedAt_idx" ON "stock_receipts"("supplierId", "receivedAt");

ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_sourceOrderId_fkey"
  FOREIGN KEY ("sourceOrderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "stock_receipt_items" (
  "id" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" INTEGER NOT NULL,
  "productCost" INTEGER NOT NULL,
  "allocatedAdditionalCost" INTEGER NOT NULL,
  "landedTotalCost" INTEGER NOT NULL,
  "landedUnitCost" INTEGER NOT NULL,
  "stockReceiptId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  CONSTRAINT "stock_receipt_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stock_receipt_items_stockReceiptId_idx" ON "stock_receipt_items"("stockReceiptId");
CREATE INDEX "stock_receipt_items_productId_idx" ON "stock_receipt_items"("productId");

ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_stockReceiptId_fkey"
  FOREIGN KEY ("stockReceiptId") REFERENCES "stock_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_receipt_items" ADD CONSTRAINT "stock_receipt_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sales" ADD COLUMN "cashSessionId" TEXT;
ALTER TABLE "expenses" ADD COLUMN "cashSessionId" TEXT;
ALTER TABLE "debt_payments" ADD COLUMN "cashSessionId" TEXT;
ALTER TABLE "stock_movements" ADD COLUMN "stockReceiptId" TEXT;

ALTER TABLE "sales" ADD CONSTRAINT "sales_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_stockReceiptId_fkey"
  FOREIGN KEY ("stockReceiptId") REFERENCES "stock_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
