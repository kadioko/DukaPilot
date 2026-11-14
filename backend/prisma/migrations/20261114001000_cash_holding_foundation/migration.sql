CREATE TABLE "cash_holding_epochs" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "openingAmount" INTEGER NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  "openedBy" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  CONSTRAINT "cash_holding_epochs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_holding_epochs_mode_check" CHECK ("mode" IN ('AUTO', 'HANDOVER', 'MANUAL')),
  CONSTRAINT "cash_holding_epochs_opening_check" CHECK ("openingAmount" >= 0)
);

CREATE TABLE "cash_holding_movements" (
  "id" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "epochId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "note" TEXT,
  "recordedBy" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "sourceType" TEXT,
  "sourceId" TEXT,
  "relatedSourceType" TEXT,
  "relatedSourceId" TEXT,
  "cashSessionId" TEXT,
  "reversesMovementId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_holding_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_holding_movements_amount_check" CHECK ("amount" <> 0),
  CONSTRAINT "cash_holding_movements_source_pair_check" CHECK (("sourceType" IS NULL) = ("sourceId" IS NULL)),
  CONSTRAINT "cash_holding_movements_related_source_pair_check" CHECK (("relatedSourceType" IS NULL) = ("relatedSourceId" IS NULL))
);

CREATE UNIQUE INDEX "cash_holding_epochs_shopId_requestKey_key" ON "cash_holding_epochs"("shopId", "requestKey");
CREATE UNIQUE INDEX "cash_holding_epochs_one_open_per_shop" ON "cash_holding_epochs"("shopId") WHERE "closedAt" IS NULL;
CREATE INDEX "cash_holding_epochs_shopId_openedAt_idx" ON "cash_holding_epochs"("shopId", "openedAt");
CREATE UNIQUE INDEX "cash_holding_movements_shopId_requestKey_key" ON "cash_holding_movements"("shopId", "requestKey");
CREATE UNIQUE INDEX "cash_holding_movements_shopId_sourceType_sourceId_key" ON "cash_holding_movements"("shopId", "sourceType", "sourceId");
CREATE UNIQUE INDEX "cash_holding_movements_cashSessionId_key" ON "cash_holding_movements"("cashSessionId");
CREATE UNIQUE INDEX "cash_holding_movements_reversesMovementId_key" ON "cash_holding_movements"("reversesMovementId");
CREATE INDEX "cash_holding_movements_shopId_epochId_createdAt_idx" ON "cash_holding_movements"("shopId", "epochId", "createdAt");
CREATE INDEX "cash_holding_movements_related_source_idx" ON "cash_holding_movements"("shopId", "epochId", "relatedSourceType", "relatedSourceId");

ALTER TABLE "cash_holding_epochs" ADD CONSTRAINT "cash_holding_epochs_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_holding_movements" ADD CONSTRAINT "cash_holding_movements_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_holding_movements" ADD CONSTRAINT "cash_holding_movements_epochId_fkey" FOREIGN KEY ("epochId") REFERENCES "cash_holding_epochs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_holding_movements" ADD CONSTRAINT "cash_holding_movements_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cash_holding_movements" ADD CONSTRAINT "cash_holding_movements_reversesMovementId_fkey" FOREIGN KEY ("reversesMovementId") REFERENCES "cash_holding_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
