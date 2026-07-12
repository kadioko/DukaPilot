ALTER TABLE "staff_members" ADD COLUMN "canRecordExpenses" BOOLEAN NOT NULL DEFAULT false;
UPDATE "staff_members" SET "canRecordExpenses" = true WHERE "role" IN ('OWNER', 'MANAGER');
