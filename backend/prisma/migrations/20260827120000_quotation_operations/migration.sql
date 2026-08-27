CREATE TYPE "QuotationPaymentKind" AS ENUM ('PAYMENT', 'REFUND');
CREATE TYPE "QuotationReminderType" AS ENUM ('EXPIRING_SOON', 'DEPOSIT_OVERDUE', 'VIEWED_NOT_ACCEPTED');

ALTER TABLE "quotation_payments"
  ADD COLUMN "kind" "QuotationPaymentKind" NOT NULL DEFAULT 'PAYMENT',
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "cashSessionId" TEXT;

ALTER TABLE "quotation_payments"
  ADD CONSTRAINT "quotation_payments_cashSessionId_fkey"
  FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "quotation_payments_quotationId_idempotencyKey_key"
  ON "quotation_payments"("quotationId", "idempotencyKey");
CREATE INDEX "quotation_payments_cashSessionId_paymentMethod_idx"
  ON "quotation_payments"("cashSessionId", "paymentMethod");

CREATE TABLE "quotation_reminders" (
  "id" TEXT NOT NULL,
  "quotationId" TEXT NOT NULL,
  "type" "QuotationReminderType" NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quotation_reminders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "quotation_reminders_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "quotation_reminders_quotationId_type_revisionNumber_key"
  ON "quotation_reminders"("quotationId", "type", "revisionNumber");
CREATE INDEX "quotation_reminders_sentAt_idx" ON "quotation_reminders"("sentAt");
