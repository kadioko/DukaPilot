ALTER TABLE "shops"
  ADD COLUMN "externalAiEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "externalAiConsentAt" TIMESTAMP(3),
  ADD COLUMN "externalAiConsentVersion" TEXT;

CREATE TABLE "assistant_ai_usage" (
  "id" TEXT NOT NULL,
  "shopId" TEXT,
  "scopeKey" TEXT NOT NULL,
  "usageDate" DATE NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "assistant_ai_usage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "assistant_ai_usage_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "assistant_ai_usage_scopeKey_usageDate_key" ON "assistant_ai_usage"("scopeKey", "usageDate");
CREATE INDEX "assistant_ai_usage_usageDate_idx" ON "assistant_ai_usage"("usageDate");
