ALTER TABLE "staff_members"
  ADD COLUMN "canManageCashSessions" BOOLEAN NOT NULL DEFAULT false;

UPDATE "staff_members"
SET "canManageCashSessions" = true
WHERE "role" IN ('OWNER', 'MANAGER');
