-- Existing businesses keep today's checkout behavior; new businesses opt in.
ALTER TABLE "shops" ADD COLUMN "allowVariableSalePrices" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "shops" ALTER COLUMN "allowVariableSalePrices" SET DEFAULT FALSE;

ALTER TABLE "sale_items" ADD COLUMN "listedUnitPrice" INTEGER;
