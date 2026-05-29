-- Add subscription/trial fields to shops table
ALTER TABLE "shops" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'FREE_TRIAL';
ALTER TABLE "shops" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "shops" ADD COLUMN "subscriptionEndsAt" TIMESTAMP(3);
ALTER TABLE "shops" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Set trial end date for existing shops: 14 days from createdAt
UPDATE "shops" SET "trialEndsAt" = "createdAt" + INTERVAL '14 days' WHERE "trialEndsAt" IS NULL;

-- Index for subscription queries
CREATE INDEX "shops_plan_idx" ON "shops"("plan");
CREATE INDEX "shops_isActive_idx" ON "shops"("isActive");
