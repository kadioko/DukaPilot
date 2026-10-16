ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_RECEIVED';
CREATE TYPE "SupplierCreditKind" AS ENUM ('RETURN', 'CREDIT_NOTE');

ALTER TABLE "order_items" ADD COLUMN "receivedQuantity" INTEGER NOT NULL DEFAULT 0;
UPDATE "order_items" AS oi
SET "receivedQuantity" = LEAST(oi."quantity", COALESCE((
  SELECT SUM(sri."quantity") AS quantity
  FROM "stock_receipts" AS sr
  JOIN "stock_receipt_items" AS sri ON sri."stockReceiptId" = sr."id"
  WHERE sr."sourceOrderId" = oi."orderId" AND sri."productId" = oi."productId"
), 0));
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_receivedQuantity_bounds_check" CHECK ("receivedQuantity" >= 0 AND "receivedQuantity" <= "quantity");
ALTER TABLE "stock_receipts" ADD COLUMN "paidAtReceipt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "stock_receipts" ADD COLUMN "paymentReference" TEXT;
UPDATE "stock_receipts"
SET "paidAtReceipt" = CASE WHEN "paymentMethod" = 'CREDIT' THEN 0 ELSE "totalLandedCost" END;
DROP INDEX IF EXISTS "stock_receipts_sourceOrderId_key";
CREATE INDEX "stock_receipts_sourceOrderId_receivedAt_idx" ON "stock_receipts"("sourceOrderId", "receivedAt");

CREATE TABLE "supplier_payments" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "paymentReference" TEXT,
  "note" TEXT,
  "requestKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedBy" TEXT,
  "cashSessionId" TEXT,
  "reversalOfId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "supplier_payment_allocations" (
  "id" TEXT NOT NULL,
  "supplierPaymentId" TEXT NOT NULL,
  "stockReceiptId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "supplier_credits" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "stockReceiptId" TEXT NOT NULL,
  "kind" "SupplierCreditKind" NOT NULL,
  "requestKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "note" TEXT,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedBy" TEXT,
  "reversalOfId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_credits_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "supplier_credit_lines" (
  "id" TEXT NOT NULL,
  "supplierCreditId" TEXT NOT NULL,
  "stockReceiptItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "amount" INTEGER NOT NULL,
  CONSTRAINT "supplier_credit_lines_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_nonzero_amount_check" CHECK ("amount" <> 0);
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_nonzero_amount_check" CHECK ("amount" <> 0);

ALTER TABLE "stock_movements" ADD COLUMN "supplierCreditLineId" TEXT;
CREATE UNIQUE INDEX "stock_movements_supplierCreditLineId_key" ON "stock_movements"("supplierCreditLineId");

CREATE UNIQUE INDEX "supplier_payments_shopId_requestKey_key" ON "supplier_payments"("shopId", "requestKey");
CREATE UNIQUE INDEX "supplier_payments_reversalOfId_key" ON "supplier_payments"("reversalOfId");
CREATE INDEX "supplier_payments_shopId_supplierId_paidAt_idx" ON "supplier_payments"("shopId", "supplierId", "paidAt");
CREATE INDEX "supplier_payments_cashSessionId_paymentMethod_idx" ON "supplier_payments"("cashSessionId", "paymentMethod");
CREATE UNIQUE INDEX "supplier_payment_allocations_supplierPaymentId_stockReceiptId_key" ON "supplier_payment_allocations"("supplierPaymentId", "stockReceiptId");
CREATE INDEX "supplier_payment_allocations_stockReceiptId_idx" ON "supplier_payment_allocations"("stockReceiptId");
CREATE UNIQUE INDEX "supplier_credits_shopId_requestKey_key" ON "supplier_credits"("shopId", "requestKey");
CREATE UNIQUE INDEX "supplier_credits_reversalOfId_key" ON "supplier_credits"("reversalOfId");
CREATE INDEX "supplier_credits_shopId_supplierId_issuedAt_idx" ON "supplier_credits"("shopId", "supplierId", "issuedAt");
CREATE INDEX "supplier_credits_stockReceiptId_idx" ON "supplier_credits"("stockReceiptId");
CREATE INDEX "supplier_credit_lines_stockReceiptItemId_idx" ON "supplier_credit_lines"("stockReceiptItemId");

ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "supplier_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES "supplier_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "stock_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_stockReceiptId_fkey" FOREIGN KEY ("stockReceiptId") REFERENCES "stock_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "supplier_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_credit_lines" ADD CONSTRAINT "supplier_credit_lines_supplierCreditId_fkey" FOREIGN KEY ("supplierCreditId") REFERENCES "supplier_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_credit_lines" ADD CONSTRAINT "supplier_credit_lines_stockReceiptItemId_fkey" FOREIGN KEY ("stockReceiptItemId") REFERENCES "stock_receipt_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_supplierCreditLineId_fkey" FOREIGN KEY ("supplierCreditLineId") REFERENCES "supplier_credit_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
