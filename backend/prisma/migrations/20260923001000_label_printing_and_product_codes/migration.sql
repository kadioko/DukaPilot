CREATE TYPE "LabelLayout" AS ENUM ('BARCODE_ONLY', 'NAME_PRICE', 'NAME_BARCODE', 'NAME_PRICE_BARCODE', 'CUSTOM');
CREATE TYPE "PrinterDriver" AS ENUM ('BROWSER', 'PDF', 'ZPL', 'TSPL', 'ESCPOS');
CREATE TYPE "LabelPrintStatus" AS ENUM ('PREPARED', 'COMPLETED', 'FAILED');

ALTER TABLE "shops"
  ADD COLUMN "nextBarcodeNumber" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextSkuNumber" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "products" ADD COLUMN "labelName" TEXT;

-- Preserve the next sequence value when a shop already has DukaPilot-generated codes.
UPDATE "shops" AS shop
SET "nextBarcodeNumber" = COALESCE((
  SELECT MAX(CAST(SUBSTRING(product."barcode" FROM 3) AS INTEGER))
  FROM "products" AS product
  WHERE product."shopId" = shop."id" AND product."barcode" ~ '^DP[0-9]{8}$'
), 0),
"nextSkuNumber" = COALESCE((
  SELECT MAX(CAST(SUBSTRING(product."sku" FROM 6) AS INTEGER))
  FROM "products" AS product
  WHERE product."shopId" = shop."id" AND product."sku" ~ '^DPSKU[0-9]{6}$'
), 0);

CREATE TABLE "label_templates" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "layout" "LabelLayout" NOT NULL DEFAULT 'NAME_PRICE_BARCODE',
  "widthMm" DOUBLE PRECISION NOT NULL DEFAULT 40,
  "heightMm" DOUBLE PRECISION NOT NULL DEFAULT 30,
  "columns" INTEGER NOT NULL DEFAULT 1,
  "gapMm" DOUBLE PRECISION NOT NULL DEFAULT 2,
  "fields" JSONB,
  "barcodeType" "BarcodeType",
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "label_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "printer_profiles" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "driver" "PrinterDriver" NOT NULL DEFAULT 'BROWSER',
  "widthMm" DOUBLE PRECISION NOT NULL DEFAULT 40,
  "heightMm" DOUBLE PRECISION NOT NULL DEFAULT 30,
  "dpi" INTEGER NOT NULL DEFAULT 203,
  "transport" TEXT NOT NULL DEFAULT 'BROWSER_DOWNLOAD',
  "options" JSONB,
  "templateId" TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastTestedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "printer_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "label_print_jobs" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "templateId" TEXT,
  "printerProfileId" TEXT,
  "outputDriver" "PrinterDriver" NOT NULL,
  "status" "LabelPrintStatus" NOT NULL DEFAULT 'PREPARED',
  "items" JSONB NOT NULL,
  "templateSnapshot" JSONB NOT NULL,
  "profileSnapshot" JSONB,
  "error" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "label_print_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "label_templates_shopId_name_key" ON "label_templates"("shopId", "name");
CREATE INDEX "label_templates_shopId_isDefault_idx" ON "label_templates"("shopId", "isDefault");
CREATE UNIQUE INDEX "printer_profiles_shopId_name_key" ON "printer_profiles"("shopId", "name");
CREATE INDEX "printer_profiles_shopId_isDefault_idx" ON "printer_profiles"("shopId", "isDefault");
CREATE INDEX "label_print_jobs_shopId_createdAt_idx" ON "label_print_jobs"("shopId", "createdAt");

ALTER TABLE "label_templates" ADD CONSTRAINT "label_templates_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "printer_profiles" ADD CONSTRAINT "printer_profiles_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "printer_profiles" ADD CONSTRAINT "printer_profiles_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "label_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "label_print_jobs" ADD CONSTRAINT "label_print_jobs_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "label_print_jobs" ADD CONSTRAINT "label_print_jobs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "label_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "label_print_jobs" ADD CONSTRAINT "label_print_jobs_printerProfileId_fkey" FOREIGN KEY ("printerProfileId") REFERENCES "printer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
