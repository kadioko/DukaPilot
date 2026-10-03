ALTER TABLE "shops" ADD COLUMN "supportAssigneeId" TEXT;
ALTER TABLE "shops" ADD COLUMN "nextFollowUpAt" TIMESTAMP(3);

ALTER TABLE "shops" ADD CONSTRAINT "shops_supportAssigneeId_fkey" FOREIGN KEY ("supportAssigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "shops_supportAssigneeId_nextFollowUpAt_idx" ON "shops"("supportAssigneeId", "nextFollowUpAt");

CREATE TABLE "shop_support_notes" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "authorId" TEXT,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shop_support_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "shop_support_notes_shopId_createdAt_idx" ON "shop_support_notes"("shopId", "createdAt");
ALTER TABLE "shop_support_notes" ADD CONSTRAINT "shop_support_notes_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shop_support_notes" ADD CONSTRAINT "shop_support_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "shop_support_notes" ("id", "shopId", "authorId", "body", "createdAt")
SELECT 'legacy-' || md5("id"), "id", NULL, "followUpNotes", COALESCE("lastContactedAt", "updatedAt")
FROM "shops"
WHERE "followUpNotes" IS NOT NULL AND btrim("followUpNotes") <> '';

CREATE TABLE "login_failure_events" (
  "id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "login_failure_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "login_failure_events_createdAt_reason_idx" ON "login_failure_events"("createdAt", "reason");
