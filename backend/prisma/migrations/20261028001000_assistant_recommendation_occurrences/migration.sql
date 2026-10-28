ALTER TABLE "assistant_actions" ADD COLUMN "snapshotKey" TEXT;

UPDATE "assistant_actions"
SET "snapshotKey" = to_char("createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam', 'YYYY-MM-DD')
WHERE "snapshotKey" IS NULL;

ALTER TABLE "assistant_actions" ALTER COLUMN "snapshotKey" SET NOT NULL;

DROP INDEX "assistant_actions_shopId_actionKey_key";
CREATE UNIQUE INDEX "assistant_actions_shopId_actionKey_snapshotKey_key"
  ON "assistant_actions"("shopId", "actionKey", "snapshotKey");
CREATE INDEX "assistant_actions_shopId_snapshotKey_idx"
  ON "assistant_actions"("shopId", "snapshotKey");
CREATE INDEX "assistant_action_events_createdAt_idx"
  ON "assistant_action_events"("createdAt");
