ALTER TABLE "sales"
  ADD COLUMN "createdByStaffId" TEXT;

CREATE INDEX "sales_shopId_createdByStaffId_createdAt_idx"
  ON "sales"("shopId", "createdByStaffId", "createdAt");

-- Recover attribution for historical staff sales linked to that staff member's cash drawer.
UPDATE "sales" AS sale
SET "createdByStaffId" = substring(session."openedById" from 7)
FROM "cash_sessions" AS session
WHERE sale."cashSessionId" = session."id"
  AND session."openedById" LIKE 'staff:%';
