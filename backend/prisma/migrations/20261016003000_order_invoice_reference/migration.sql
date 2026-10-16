ALTER TABLE "orders" ADD COLUMN "invoiceNumber" TEXT;

CREATE INDEX "orders_shopId_supplierId_invoiceNumber_idx"
  ON "orders"("shopId", "supplierId", "invoiceNumber");
