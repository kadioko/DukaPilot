ALTER TABLE "recurring_expenses"
  ADD COLUMN "dayOfMonth" INTEGER,
  ADD COLUMN "requestKey" TEXT,
  ADD COLUMN "requestHash" TEXT;

ALTER TABLE "recurring_expenses"
  ADD CONSTRAINT "recurring_expenses_dayOfMonth_check"
  CHECK ("dayOfMonth" IS NULL OR "dayOfMonth" BETWEEN 1 AND 31);

ALTER TABLE "expenses"
  ADD COLUMN "requestKey" TEXT,
  ADD COLUMN "requestHash" TEXT,
  ADD COLUMN "recurringExpenseId" TEXT,
  ADD COLUMN "recurrenceDueAt" TIMESTAMP(3),
  ADD COLUMN "dateReviewedAt" TIMESTAMP(3),
  ADD COLUMN "dateReviewedById" TEXT;

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_recurringExpenseId_fkey"
  FOREIGN KEY ("recurringExpenseId") REFERENCES "recurring_expenses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "recurring_expenses_shopId_requestKey_key"
  ON "recurring_expenses"("shopId", "requestKey");
CREATE UNIQUE INDEX "expenses_shopId_requestKey_key"
  ON "expenses"("shopId", "requestKey");
CREATE UNIQUE INDEX "expenses_recurringExpenseId_recurrenceDueAt_key"
  ON "expenses"("recurringExpenseId", "recurrenceDueAt");
