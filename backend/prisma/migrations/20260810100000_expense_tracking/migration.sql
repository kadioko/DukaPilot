ALTER TABLE "expenses"
  ADD COLUMN "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH';

CREATE TABLE "recurring_expenses" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
  "vendor" TEXT,
  "note" TEXT,
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "nextDueAt" TIMESTAMP(3) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "shopId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recurring_expenses_shopId_isActive_nextDueAt_idx"
  ON "recurring_expenses"("shopId", "isActive", "nextDueAt");

ALTER TABLE "recurring_expenses"
  ADD CONSTRAINT "recurring_expenses_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
