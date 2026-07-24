CREATE TYPE "BarcodeType" AS ENUM ('EAN13', 'UPC', 'CODE128', 'INTERNAL');

ALTER TABLE "shops"
  ADD COLUMN "barcodeScanningEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "bluetoothScannerEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "barcodeGenerationEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "barcodeAutoFocus" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "barcodeSuccessSound" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "barcodeVibrate" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "barcodeAutoAddToCart" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "products"
  ADD COLUMN "barcode" TEXT,
  ADD COLUMN "barcodeType" "BarcodeType",
  ADD COLUMN "barcodeGenerated" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "barcodeCreatedAt" TIMESTAMP(3),
  ADD COLUMN "barcodeUpdatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");
CREATE INDEX "products_shopId_barcode_idx" ON "products"("shopId", "barcode");

CREATE TABLE "barcode_scans" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "productId" TEXT,
  "barcode" TEXT NOT NULL,
  "context" TEXT NOT NULL DEFAULT 'POS',
  "found" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "barcode_scans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "barcode_scans_shopId_barcode_idx" ON "barcode_scans"("shopId", "barcode");
CREATE INDEX "barcode_scans_shopId_createdAt_idx" ON "barcode_scans"("shopId", "createdAt");
ALTER TABLE "barcode_scans" ADD CONSTRAINT "barcode_scans_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "barcode_scans" ADD CONSTRAINT "barcode_scans_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "stock_counts" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "stock_counts_shopId_status_idx" ON "stock_counts"("shopId", "status");
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "stock_count_items" (
  "id" TEXT NOT NULL,
  "stockCountId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "expected" INTEGER NOT NULL,
  "counted" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stock_count_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_count_items_stockCountId_productId_key" ON "stock_count_items"("stockCountId", "productId");
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_stockCountId_fkey" FOREIGN KEY ("stockCountId") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_count_items" ADD CONSTRAINT "stock_count_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
