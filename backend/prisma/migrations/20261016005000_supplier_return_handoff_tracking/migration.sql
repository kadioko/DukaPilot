CREATE TYPE "SupplierReturnStatus" AS ENUM (
  'RECORDED',
  'HANDED_OVER',
  'SUPPLIER_ACKNOWLEDGED',
  'DISPUTED'
);

CREATE TABLE "supplier_return_status_events" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "supplierCreditId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "status" "SupplierReturnStatus" NOT NULL,
  "note" TEXT,
  "reference" TEXT,
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "supplier_return_status_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_return_status_events_shopId_requestKey_key"
  ON "supplier_return_status_events"("shopId", "requestKey");
CREATE INDEX "supplier_return_status_events_shopId_supplierCreditId_createdAt_idx"
  ON "supplier_return_status_events"("shopId", "supplierCreditId", "createdAt");

ALTER TABLE "supplier_return_status_events"
  ADD CONSTRAINT "supplier_return_status_events_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_return_status_events"
  ADD CONSTRAINT "supplier_return_status_events_supplierCreditId_fkey"
  FOREIGN KEY ("supplierCreditId") REFERENCES "supplier_credits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "supplier_return_status_events" (
  "id", "shopId", "supplierCreditId", "requestKey", "requestHash", "status", "note", "recordedBy", "createdAt"
)
SELECT
  'legacy-return-status-' || c."id",
  c."shopId",
  c."id",
  'legacy-return-status-' || c."id",
  'legacy-' || c."id",
  'RECORDED'::"SupplierReturnStatus",
  'Return recorded; handoff confirmation was not recorded in DukaPilot.',
  c."recordedBy",
  c."createdAt"
FROM "supplier_credits" c
WHERE c."kind" = 'RETURN' AND c."reversalOfId" IS NULL;
