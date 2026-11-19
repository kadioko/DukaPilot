ALTER TABLE "shops" ADD COLUMN "productNameCase" TEXT NOT NULL DEFAULT 'ORIGINAL';
ALTER TABLE "shops" ADD CONSTRAINT "shops_productNameCase_check" CHECK ("productNameCase" IN ('ORIGINAL', 'UPPERCASE', 'LOWERCASE'));
