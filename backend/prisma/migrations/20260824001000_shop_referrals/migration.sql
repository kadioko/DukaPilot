ALTER TABLE "shops" ADD COLUMN "referralCode" TEXT;

-- Existing merchants receive a stable share code immediately after deployment.
UPDATE "shops" SET "referralCode" = 'DP-S-' || UPPER("id") WHERE "referralCode" IS NULL;

ALTER TABLE "shops" ALTER COLUMN "referralCode" SET NOT NULL;
CREATE UNIQUE INDEX "shops_referralCode_key" ON "shops"("referralCode");

CREATE TABLE "shop_referrals" (
  "id" TEXT NOT NULL,
  "referrerShopId" TEXT NOT NULL,
  "referredShopId" TEXT NOT NULL,
  "referralCode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "qualifiedAt" TIMESTAMP(3),
  "rewardedAt" TIMESTAMP(3),
  "rewardedBy" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "shop_referrals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shop_referrals_referredShopId_key" ON "shop_referrals"("referredShopId");
CREATE INDEX "shop_referrals_referrerShopId_createdAt_idx" ON "shop_referrals"("referrerShopId", "createdAt");
CREATE INDEX "shop_referrals_status_createdAt_idx" ON "shop_referrals"("status", "createdAt");

ALTER TABLE "shop_referrals" ADD CONSTRAINT "shop_referrals_referrerShopId_fkey"
  FOREIGN KEY ("referrerShopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shop_referrals" ADD CONSTRAINT "shop_referrals_referredShopId_fkey"
  FOREIGN KEY ("referredShopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
