ALTER TABLE "sales" ADD COLUMN "customerOrderId" TEXT;
ALTER TABLE "customer_orders" ADD COLUMN "convertedAt" TIMESTAMP(3);
ALTER TABLE "customer_order_items" ADD COLUMN "buyingPrice" INTEGER;

CREATE UNIQUE INDEX "sales_customerOrderId_key" ON "sales"("customerOrderId");

ALTER TABLE "sales"
  ADD CONSTRAINT "sales_customerOrderId_fkey"
  FOREIGN KEY ("customerOrderId") REFERENCES "customer_orders"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
