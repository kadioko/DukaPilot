CREATE TABLE "pin_reset_otps" (
  "phone" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastSentAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pin_reset_otps_pkey" PRIMARY KEY ("phone")
);

CREATE INDEX "pin_reset_otps_expiresAt_idx" ON "pin_reset_otps"("expiresAt");
CREATE INDEX "stock_movements_productId_createdAt_idx" ON "stock_movements"("productId", "createdAt");
CREATE INDEX "sales_cashSessionId_paymentMethod_status_idx" ON "sales"("cashSessionId", "paymentMethod", "status");
CREATE INDEX "debt_payments_cashSessionId_paymentMethod_idx" ON "debt_payments"("cashSessionId", "paymentMethod");
CREATE INDEX "expenses_cashSessionId_paymentMethod_idx" ON "expenses"("cashSessionId", "paymentMethod");
CREATE INDEX "customer_orders_shopId_status_createdAt_idx" ON "customer_orders"("shopId", "status", "createdAt");
CREATE INDEX "orders_shopId_createdAt_idx" ON "orders"("shopId", "createdAt");
CREATE INDEX "debts_shopId_status_createdAt_idx" ON "debts"("shopId", "status", "createdAt");
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE INDEX "quotations_status_expiryDate_idx" ON "quotations"("status", "expiryDate");
CREATE INDEX "quotations_status_depositDueDate_idx" ON "quotations"("status", "depositDueDate");
CREATE INDEX "quotation_shares_quotationId_viewedAt_idx" ON "quotation_shares"("quotationId", "viewedAt");
