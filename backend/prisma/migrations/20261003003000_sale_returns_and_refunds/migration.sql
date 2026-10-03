ALTER TABLE "sale_items" ADD COLUMN "returnedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "stock_movements" ADD COLUMN "saleReturnItemId" TEXT;
ALTER TABLE "stock_receipts" ADD COLUMN "requestKey" TEXT;
ALTER TABLE "stock_receipts" ADD COLUMN "requestHash" TEXT;

CREATE TABLE "sale_returns" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "debtReduction" INTEGER NOT NULL DEFAULT 0,
    "refundAmount" INTEGER NOT NULL DEFAULT 0,
    "refundMethod" "PaymentMethod",
    "paymentRef" TEXT,
    "requestKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "recordedBy" TEXT,
    "cashSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_return_items" (
    "id" TEXT NOT NULL,
    "saleReturnId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "restockQuantity" INTEGER NOT NULL DEFAULT 0,
    "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" INTEGER NOT NULL,
    "buyingPrice" INTEGER NOT NULL,
    "totalAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sale_return_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sale_returns_shopId_requestKey_key" ON "sale_returns"("shopId", "requestKey");
CREATE INDEX "sale_returns_shopId_createdAt_idx" ON "sale_returns"("shopId", "createdAt");
CREATE INDEX "sale_returns_saleId_createdAt_idx" ON "sale_returns"("saleId", "createdAt");
CREATE INDEX "sale_returns_cashSessionId_refundMethod_idx" ON "sale_returns"("cashSessionId", "refundMethod");
CREATE UNIQUE INDEX "stock_receipts_shopId_requestKey_key" ON "stock_receipts"("shopId", "requestKey");
CREATE UNIQUE INDEX "sale_return_items_saleReturnId_saleItemId_key" ON "sale_return_items"("saleReturnId", "saleItemId");
CREATE INDEX "sale_return_items_saleItemId_createdAt_idx" ON "sale_return_items"("saleItemId", "createdAt");
CREATE UNIQUE INDEX "stock_movements_saleReturnItemId_key" ON "stock_movements"("saleReturnItemId");

ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_saleReturnId_fkey" FOREIGN KEY ("saleReturnId") REFERENCES "sale_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "sale_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_saleReturnItemId_fkey" FOREIGN KEY ("saleReturnItemId") REFERENCES "sale_return_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_returnedQuantity_nonnegative" CHECK ("returnedQuantity" >= 0 AND "returnedQuantity" <= "quantity");
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_request_pair_valid" CHECK (("requestKey" IS NULL AND "requestHash" IS NULL) OR ("requestKey" IS NOT NULL AND "requestHash" IS NOT NULL));
ALTER TABLE "sale_returns" ADD CONSTRAINT "sale_returns_amounts_valid" CHECK ("totalAmount" >= 0 AND "debtReduction" >= 0 AND "refundAmount" >= 0 AND "debtReduction" + "refundAmount" = "totalAmount" AND (("refundAmount" = 0 AND "refundMethod" IS NULL) OR ("refundAmount" > 0 AND "refundMethod" IS NOT NULL)));
ALTER TABLE "sale_return_items" ADD CONSTRAINT "sale_return_items_quantities_valid" CHECK ("quantity" > 0 AND "restockQuantity" >= 0 AND "damagedQuantity" >= 0 AND ("restockQuantity" + "damagedQuantity" = 0 OR "restockQuantity" + "damagedQuantity" = "quantity"));
