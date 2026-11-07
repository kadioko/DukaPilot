const prisma = require("../lib/prisma");

// Aggregate every product before ranking: applying returns after LIMIT can put
// the wrong product first. Values follow the existing period-event reports.
async function productInsights(shopId, from, to, metric, productId = null, client = prisma) {
  if (!["units", "revenue", "profit"].includes(metric)) throw new Error("Invalid product ranking metric");
  const rows = await client.$queryRawUnsafe(`
    WITH events AS (
      SELECT si."productId" AS id, si.quantity::numeric AS units, si."totalPrice"::numeric AS revenue,
        CASE WHEN si."buyingPrice" > 0 THEN (si."totalPrice" - si."buyingPrice" * si.quantity)::numeric ELSE 0 END AS profit,
        CASE WHEN si."buyingPrice" <= 0 THEN si."totalPrice"::numeric ELSE 0 END AS missing
      FROM sale_items si JOIN sales s ON s.id = si."saleId"
      WHERE s."shopId" = $1 AND s.status = 'COMPLETED' AND s."createdAt" >= $2 AND s."createdAt" < $3 AND si."productId" IS NOT NULL
      UNION ALL
      SELECT si."productId", -sri.quantity::numeric, -sri."totalAmount"::numeric,
        CASE WHEN sri."buyingPrice" > 0 THEN -(sri."totalAmount" - sri."buyingPrice" * sri."restockQuantity")::numeric ELSE 0 END,
        CASE WHEN sri."buyingPrice" <= 0 THEN -sri."totalAmount"::numeric ELSE 0 END
      FROM sale_return_items sri JOIN sale_returns sr ON sr.id = sri."saleReturnId" JOIN sale_items si ON si.id = sri."saleItemId"
      WHERE sr."shopId" = $1 AND sr."createdAt" >= $2 AND sr."createdAt" < $3 AND si."productId" IS NOT NULL
      UNION ALL
      SELECT si."productId", rev.quantity::numeric, rev."totalAmount"::numeric,
        CASE WHEN original."buyingPrice" > 0 THEN (rev."totalAmount" - original."buyingPrice" * rev."restockQuantity")::numeric ELSE 0 END,
        CASE WHEN original."buyingPrice" <= 0 THEN rev."totalAmount"::numeric ELSE 0 END
      FROM sale_return_item_reversals rev JOIN sale_return_reversals reversal ON reversal.id = rev."reversalId"
      JOIN sale_return_items original ON original.id = rev."saleReturnItemId" JOIN sale_items si ON si.id = original."saleItemId"
      WHERE reversal."shopId" = $1 AND reversal."createdAt" >= $2 AND reversal."createdAt" < $3 AND si."productId" IS NOT NULL
    ), totals AS (
      SELECT id, SUM(units) AS units, SUM(revenue) AS revenue, SUM(profit) AS profit, SUM(missing) AS missing
      FROM events GROUP BY id
    ), scoped AS (
      SELECT p.id, p.name, p.unit, COALESCE(t.units, 0) AS units, COALESCE(t.revenue, 0) AS revenue,
        COALESCE(t.profit, 0) AS profit, COALESCE(t.missing, 0) AS missing
      FROM products p LEFT JOIN totals t ON t.id = p.id
      WHERE p."shopId" = $1 AND ($4::text IS NULL OR p.id = $4)
    )
    SELECT *, COUNT(*) FILTER (WHERE missing <> 0) OVER ()::int AS "incompleteProducts"
    FROM scoped
    WHERE $4::text IS NOT NULL OR units <> 0 OR revenue <> 0 OR profit <> 0 OR missing <> 0
    ORDER BY CASE $5::text WHEN 'units' THEN units WHEN 'revenue' THEN revenue ELSE profit END DESC, name ASC, id ASC
    LIMIT 5`, shopId, from, to, productId, metric);
  return rows.map((row) => ({ ...row, units: Number(row.units), revenue: Number(row.revenue), profit: Number(row.profit), missing: Number(row.missing), incompleteProducts: Number(row.incompleteProducts) }));
}

module.exports = { productInsights };
