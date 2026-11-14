DROP INDEX IF EXISTS "cash_holding_movements_cashSessionId_key";

ALTER TABLE "cash_holding_movements"
  ADD COLUMN "replacesMovementId" TEXT;

CREATE UNIQUE INDEX "cash_holding_movements_replacesMovementId_key"
  ON "cash_holding_movements"("replacesMovementId");

CREATE INDEX "cash_holding_movements_shopId_cashSessionId_createdAt_idx"
  ON "cash_holding_movements"("shopId", "cashSessionId", "createdAt");

ALTER TABLE "cash_holding_movements"
  ADD CONSTRAINT "cash_holding_movements_replacesMovementId_fkey"
  FOREIGN KEY ("replacesMovementId") REFERENCES "cash_holding_movements"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
