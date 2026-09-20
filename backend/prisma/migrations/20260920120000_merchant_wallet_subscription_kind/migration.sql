-- Subscription payments are internal merchant-balance debits. They do not
-- call the provider, but they must remain part of the same immutable wallet
-- transaction and ledger history.
ALTER TABLE "merchant_wallet_transactions"
  DROP CONSTRAINT "merchant_wallet_transactions_kind_check";

ALTER TABLE "merchant_wallet_transactions"
  ADD CONSTRAINT "merchant_wallet_transactions_kind_check"
  CHECK ("kind" IN ('DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT', 'SUBSCRIPTION'));
