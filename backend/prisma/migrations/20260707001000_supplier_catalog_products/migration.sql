-- Supplier-owned catalog products that merchants can view/order from later.
-- These are separate from merchant inventory products, which remain shop-owned.
CREATE TABLE "supplier_catalog_products" (
  "id" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "unit" TEXT NOT NULL DEFAULT 'pcs',
  "price" DOUBLE PRECISION NOT NULL,
  "minOrderQty" INTEGER NOT NULL DEFAULT 1,
  "note" TEXT,
  "isAvailable" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "supplier_catalog_products_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_catalog_products_supplierId_isAvailable_idx"
  ON "supplier_catalog_products"("supplierId", "isAvailable");

ALTER TABLE "supplier_catalog_products"
  ADD CONSTRAINT "supplier_catalog_products_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
