ALTER TABLE "cash_sessions"
  ADD COLUMN "openRequestId" TEXT,
  ADD COLUMN "openRequestHash" TEXT;

CREATE UNIQUE INDEX "cash_sessions_shopId_openedById_openRequestId_key"
  ON "cash_sessions"("shopId", "openedById", "openRequestId")
  WHERE "openRequestId" IS NOT NULL;
