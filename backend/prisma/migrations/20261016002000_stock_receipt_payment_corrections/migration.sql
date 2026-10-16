CREATE TABLE "stock_receipt_payment_corrections" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "stockReceiptId" TEXT NOT NULL,
  "previousCorrectionId" TEXT,
  "previousAmount" INTEGER NOT NULL,
  "correctedAmount" INTEGER NOT NULL,
  "previousMethod" "PaymentMethod" NOT NULL,
  "correctedMethod" "PaymentMethod" NOT NULL,
  "cashOutAdjustment" INTEGER NOT NULL DEFAULT 0,
  "cashSessionId" TEXT,
  "requestKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "stock_receipt_payment_corrections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stock_receipt_payment_corrections_amounts_check" CHECK ("previousAmount" >= 0 AND "correctedAmount" >= 0),
  CONSTRAINT "stock_receipt_payment_corrections_cash_check" CHECK (
    "cashOutAdjustment" =
      (CASE WHEN "correctedMethod" = 'CASH' THEN "correctedAmount" ELSE 0 END)
      - (CASE WHEN "previousMethod" = 'CASH' THEN "previousAmount" ELSE 0 END)
  ),
  CONSTRAINT "stock_receipt_payment_corrections_cash_session_check" CHECK (
    ("cashOutAdjustment" = 0 AND "cashSessionId" IS NULL)
    OR ("cashOutAdjustment" <> 0 AND "cashSessionId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "stock_receipt_payment_corrections_shopId_requestKey_key"
  ON "stock_receipt_payment_corrections"("shopId", "requestKey");
CREATE UNIQUE INDEX "stock_receipt_payment_corrections_previousCorrectionId_key"
  ON "stock_receipt_payment_corrections"("previousCorrectionId");
CREATE INDEX "stock_receipt_payment_corrections_stockReceiptId_createdAt_idx"
  ON "stock_receipt_payment_corrections"("stockReceiptId", "createdAt");
CREATE INDEX "stock_receipt_payment_corrections_cashSessionId_idx"
  ON "stock_receipt_payment_corrections"("cashSessionId");

ALTER TABLE "stock_receipt_payment_corrections"
  ADD CONSTRAINT "stock_receipt_payment_corrections_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_receipt_payment_corrections"
  ADD CONSTRAINT "stock_receipt_payment_corrections_stockReceiptId_fkey"
  FOREIGN KEY ("stockReceiptId") REFERENCES "stock_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_receipt_payment_corrections"
  ADD CONSTRAINT "stock_receipt_payment_corrections_previousCorrectionId_fkey"
  FOREIGN KEY ("previousCorrectionId") REFERENCES "stock_receipt_payment_corrections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_receipt_payment_corrections"
  ADD CONSTRAINT "stock_receipt_payment_corrections_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
