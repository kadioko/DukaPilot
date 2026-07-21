ALTER TABLE "shops"
ADD COLUMN "acquisitionSource" TEXT,
ADD COLUMN "acquisitionMedium" TEXT,
ADD COLUMN "acquisitionCampaign" TEXT,
ADD COLUMN "acquisitionContent" TEXT;

CREATE TABLE "marketing_events" (
  "id" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "pagePath" TEXT,
  "source" TEXT,
  "medium" TEXT,
  "campaign" TEXT,
  "content" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "marketing_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketing_events_eventName_createdAt_idx" ON "marketing_events"("eventName", "createdAt");
CREATE INDEX "marketing_events_source_campaign_createdAt_idx" ON "marketing_events"("source", "campaign", "createdAt");
