-- Printer-independent product labels and local print bridge profile metadata.
-- Existing barcode and profile fields are retained for backward compatibility.

ALTER TYPE "PrinterDriver" ADD VALUE IF NOT EXISTS 'EPL';

DO $$ BEGIN
  CREATE TYPE "PrinterConnection" AS ENUM ('BROWSER', 'DOWNLOAD', 'BRIDGE', 'NETWORK', 'USB', 'BLUETOOTH');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "manufacturerBarcode" TEXT;
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "internalBarcode" TEXT;

-- Preserve every existing barcode as the appropriate explicit code.
UPDATE "products"
SET "manufacturerBarcode" = "barcode"
WHERE "barcode" IS NOT NULL
  AND "manufacturerBarcode" IS NULL
  AND ("barcodeType" IS NULL OR "barcodeType" <> 'INTERNAL');

UPDATE "products"
SET "internalBarcode" = "barcode"
WHERE "barcode" IS NOT NULL
  AND "internalBarcode" IS NULL
  AND "barcodeType" = 'INTERNAL';

CREATE UNIQUE INDEX IF NOT EXISTS "products_shopId_manufacturerBarcode_key"
  ON "products"("shopId", "manufacturerBarcode")
  WHERE "manufacturerBarcode" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "products_shopId_internalBarcode_key"
  ON "products"("shopId", "internalBarcode")
  WHERE "internalBarcode" IS NOT NULL;

ALTER TABLE "label_templates" ADD COLUMN IF NOT EXISTS "customText" TEXT;

ALTER TABLE "printer_profiles" ADD COLUMN IF NOT EXISTS "connection" "PrinterConnection" NOT NULL DEFAULT 'BROWSER';
ALTER TABLE "printer_profiles" ADD COLUMN IF NOT EXISTS "model" TEXT;
ALTER TABLE "printer_profiles" ADD COLUMN IF NOT EXISTS "config" JSONB;
ALTER TABLE "printer_profiles" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

UPDATE "printer_profiles"
SET "connection" = CASE
  WHEN "transport" = 'PRINT_BRIDGE' THEN 'BRIDGE'::"PrinterConnection"
  WHEN "driver" IN ('ZPL', 'TSPL', 'ESCPOS') THEN 'DOWNLOAD'::"PrinterConnection"
  ELSE 'BROWSER'::"PrinterConnection"
END;

-- Deliberately do not copy legacy JSON options into config: a profile must
-- never inherit an unreviewed bridge token or other printer secret.
