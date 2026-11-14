ALTER TABLE "cash_sessions"
  ADD COLUMN "cashTransferredOut" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cashTransferDestination" TEXT;

ALTER TABLE "cash_sessions"
  ADD CONSTRAINT "cash_sessions_cash_transfer_check"
  CHECK (
    "cashTransferredOut" >= 0
    AND (("cashTransferredOut" = 0 AND "cashTransferDestination" IS NULL)
      OR ("cashTransferredOut" > 0 AND "cashTransferDestination" IN ('SAFE', 'BANK', 'MOBILE_MONEY', 'OWNER_WITHDRAWAL')))
  );
