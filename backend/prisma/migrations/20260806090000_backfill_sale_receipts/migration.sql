BEGIN;

LOCK TABLE "shops" IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE "sales" IN SHARE ROW EXCLUSIVE MODE;

WITH shop_receipt_max AS (
  SELECT "shopId", COALESCE(MAX("receiptNumber"), 0) AS base
  FROM "sales"
  GROUP BY "shopId"
),
legacy_sales AS (
  SELECT
    sale.id,
    (receipt_max.base + ROW_NUMBER() OVER (
      PARTITION BY sale."shopId"
      ORDER BY sale."createdAt", sale.id
    ))::INTEGER AS receipt_number
  FROM "sales" AS sale
  JOIN shop_receipt_max AS receipt_max ON receipt_max."shopId" = sale."shopId"
  WHERE sale."receiptNumber" IS NULL
)
UPDATE "sales" AS sale
SET "receiptNumber" = legacy_sales.receipt_number
FROM legacy_sales
WHERE sale.id = legacy_sales.id;

UPDATE "shops" AS shop
SET "nextSaleNumber" = GREATEST(
  shop."nextSaleNumber",
  COALESCE((
    SELECT MAX(sale."receiptNumber") + 1
    FROM "sales" AS sale
    WHERE sale."shopId" = shop.id
  ), 1)
);

COMMIT;
