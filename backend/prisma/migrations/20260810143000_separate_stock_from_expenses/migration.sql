-- Keep legacy stock-purchase records for audit history, but prevent old recurring
-- templates from creating expenses that would duplicate cost of goods sold.
UPDATE "recurring_expenses"
SET "isActive" = false
WHERE "category" = 'STOCK' AND "isActive" = true;
