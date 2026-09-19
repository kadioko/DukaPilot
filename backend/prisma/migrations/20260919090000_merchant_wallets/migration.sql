-- Merchant balances are tracked in DukaPilot's own append-only ledger. The
-- nTZS user wallet remains a pooled provider settlement account and is never
-- exposed as a merchant's technical identity.
CREATE TABLE "merchant_wallets" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "businessShopId" TEXT NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "balanceTzs" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "merchant_wallets_businessShopId_key" ON "merchant_wallets"("businessShopId");
CREATE INDEX "merchant_wallets_balanceTzs_idx" ON "merchant_wallets"("balanceTzs");

CREATE TABLE "merchant_wallet_transactions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "walletId" TEXT NOT NULL REFERENCES "merchant_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "shopId" TEXT NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestKey" TEXT NOT NULL,
  "amountTzs" INTEGER NOT NULL,
  "platformFeeTzs" INTEGER NOT NULL DEFAULT 0,
  "providerFeeTzs" INTEGER NOT NULL DEFAULT 0,
  "totalDebitTzs" INTEGER NOT NULL DEFAULT 0,
  "payerPhone" TEXT,
  "recipientPhone" TEXT,
  "recipientName" TEXT,
  "payoutRail" TEXT,
  "providerId" TEXT,
  "providerQuoteId" TEXT,
  "providerStatus" TEXT,
  "providerInstruction" TEXT,
  "failureCode" TEXT,
  "failureReason" TEXT,
  "requestedByUserId" TEXT,
  "completedAt" TIMESTAMP(3),
  "reversedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "merchant_wallet_transactions_kind_check" CHECK ("kind" IN ('DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT')),
  CONSTRAINT "merchant_wallet_transactions_status_check" CHECK ("status" IN ('PENDING', 'REVIEW', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED')),
  CONSTRAINT "merchant_wallet_transactions_amount_check" CHECK ("amountTzs" > 0),
  CONSTRAINT "merchant_wallet_transactions_fees_check" CHECK ("platformFeeTzs" >= 0 AND "providerFeeTzs" >= 0 AND "totalDebitTzs" >= 0)
);

CREATE UNIQUE INDEX "merchant_wallet_transactions_requestKey_key" ON "merchant_wallet_transactions"("requestKey");
CREATE UNIQUE INDEX "merchant_wallet_transactions_providerId_key" ON "merchant_wallet_transactions"("providerId");
CREATE INDEX "merchant_wallet_transactions_shopId_status_createdAt_idx" ON "merchant_wallet_transactions"("shopId", "status", "createdAt");
CREATE INDEX "merchant_wallet_transactions_walletId_createdAt_idx" ON "merchant_wallet_transactions"("walletId", "createdAt");
CREATE INDEX "merchant_wallet_transactions_status_updatedAt_idx" ON "merchant_wallet_transactions"("status", "updatedAt");

CREATE TABLE "merchant_wallet_entries" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "walletId" TEXT NOT NULL REFERENCES "merchant_wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "transactionId" TEXT NOT NULL REFERENCES "merchant_wallet_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "shopId" TEXT NOT NULL REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "amountTzs" INTEGER NOT NULL,
  "balanceAfterTzs" INTEGER NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "merchant_wallet_entries_direction_check" CHECK ("direction" IN ('CREDIT', 'DEBIT')),
  CONSTRAINT "merchant_wallet_entries_amount_check" CHECK ("amountTzs" > 0)
);

CREATE UNIQUE INDEX "merchant_wallet_entries_transactionId_type_key" ON "merchant_wallet_entries"("transactionId", "type");
CREATE INDEX "merchant_wallet_entries_walletId_createdAt_idx" ON "merchant_wallet_entries"("walletId", "createdAt");
CREATE INDEX "merchant_wallet_entries_shopId_createdAt_idx" ON "merchant_wallet_entries"("shopId", "createdAt");
