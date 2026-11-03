ALTER TABLE "staff_members"
  ADD COLUMN "canViewStock" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canViewSalePrices" BOOLEAN NOT NULL DEFAULT false;
