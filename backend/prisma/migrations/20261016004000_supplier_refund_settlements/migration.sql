CREATE TYPE "SupplierPaymentKind" AS ENUM ('PAYMENT', 'REFUND');

ALTER TABLE "supplier_payments"
ADD COLUMN "kind" "SupplierPaymentKind" NOT NULL DEFAULT 'PAYMENT';

CREATE INDEX "supplier_payments_cashSessionId_paymentMethod_kind_idx"
ON "supplier_payments"("cashSessionId", "paymentMethod", "kind");
