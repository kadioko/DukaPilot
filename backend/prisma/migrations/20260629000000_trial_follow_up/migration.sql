CREATE TYPE "OnboardingStatus" AS ENUM ('NEW', 'CONTACTED', 'SETUP_DONE', 'ACTIVATED', 'CONVERTED', 'CHURN_RISK');

ALTER TABLE "shops"
ADD COLUMN "onboardingStatus" "OnboardingStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN "lastContactedAt" TIMESTAMP(3),
ADD COLUMN "followUpNotes" TEXT;
