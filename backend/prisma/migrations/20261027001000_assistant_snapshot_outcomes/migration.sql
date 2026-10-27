CREATE TABLE "assistant_action_events" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "actionKey" TEXT NOT NULL,
  "impressionKey" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "measuredValue" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "assistant_action_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assistant_action_events_shopId_impressionKey_eventType_key"
  ON "assistant_action_events"("shopId", "impressionKey", "eventType");
CREATE INDEX "assistant_action_events_shopId_eventType_createdAt_idx"
  ON "assistant_action_events"("shopId", "eventType", "createdAt");
CREATE INDEX "assistant_action_events_actionKey_createdAt_idx"
  ON "assistant_action_events"("actionKey", "createdAt");

ALTER TABLE "assistant_action_events"
  ADD CONSTRAINT "assistant_action_events_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
