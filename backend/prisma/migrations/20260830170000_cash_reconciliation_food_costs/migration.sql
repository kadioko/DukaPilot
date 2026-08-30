ALTER TABLE "stock_receipts" ADD COLUMN "cashSessionId" TEXT;
ALTER TABLE "food_preparation_batches"
  ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  ADD COLUMN "cashSessionId" TEXT;

CREATE INDEX "stock_receipts_cashSessionId_paymentMethod_idx" ON "stock_receipts"("cashSessionId", "paymentMethod");
CREATE INDEX "food_preparation_batches_cashSessionId_paymentMethod_idx" ON "food_preparation_batches"("cashSessionId", "paymentMethod");

ALTER TABLE "stock_receipts"
  ADD CONSTRAINT "stock_receipts_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "food_preparation_batches"
  ADD CONSTRAINT "food_preparation_batches_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
