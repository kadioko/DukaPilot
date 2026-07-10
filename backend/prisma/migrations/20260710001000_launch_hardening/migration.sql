ALTER TABLE "shops" ADD COLUMN "isCatalogPublished" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "shops" ADD COLUMN "isDemo" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "subscription_payments" ADD COLUMN "normalizedReference" TEXT;
ALTER TABLE "subscription_payments" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE "subscription_payments" ADD COLUMN "reviewedBy" TEXT;
ALTER TABLE "subscription_payments" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "subscription_payments" ADD COLUMN "proofUrl" TEXT;
ALTER TABLE "subscription_payments" ADD COLUMN "sourceReportId" TEXT;

ALTER TABLE "staff_members" ADD COLUMN "language" TEXT NOT NULL DEFAULT 'sw';

-- A phone number must identify exactly one login. Preserve duplicate staff rows,
-- but disable ambiguous login identities so an owner can reassign them safely.
UPDATE "staff_members" AS staff
SET "phone" = NULL, "pin" = NULL, "isActive" = false
WHERE staff."phone" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "users" WHERE "users"."phone" = staff."phone");

WITH ranked_staff AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "phone"
    ORDER BY "isActive" DESC, "updatedAt" DESC, "id"
  ) AS row_number
  FROM "staff_members"
  WHERE "phone" IS NOT NULL
)
UPDATE "staff_members"
SET "phone" = NULL, "pin" = NULL, "isActive" = false
WHERE "id" IN (SELECT "id" FROM ranked_staff WHERE row_number > 1);

CREATE UNIQUE INDEX "staff_members_phone_key" ON "staff_members"("phone");
CREATE UNIQUE INDEX "subscription_payments_normalizedReference_key" ON "subscription_payments"("normalizedReference");
CREATE UNIQUE INDEX "subscription_payments_sourceReportId_key" ON "subscription_payments"("sourceReportId");

-- Keep seeded/demo accounts out of the public marketplace while preserving
-- direct authenticated access for demos and production monitoring.
UPDATE "shops"
SET "isDemo" = true, "isCatalogPublished" = false
WHERE "userId" IN (SELECT "id" FROM "users" WHERE "phone" IN ('+255700000002', '+255700000003', '+255700000004', '+255700000005'))
   OR LOWER("name") LIKE 'qa %';
