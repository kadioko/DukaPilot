-- Add supplier verification workflow fields for admin support operations.
ALTER TABLE "suppliers" ADD COLUMN "verificationStatus" TEXT NOT NULL DEFAULT 'UNVERIFIED';
ALTER TABLE "suppliers" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "suppliers" ADD COLUMN "adminNotes" TEXT;
