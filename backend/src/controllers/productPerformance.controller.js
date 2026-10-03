const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { profitRange, previousComparableRange } = require("./dashboard.controller");

const PERIODS = new Set(["today", "week", "month", "quarter", "year", "custom"]);
const SORTS = {
  revenue: '"revenue" DESC',
  profit: '"grossProfit" DESC',
  units: '"unitsSold" DESC',
  margin: '"grossMargin" DESC NULLS LAST',
  stock: 'p."currentStock" DESC',
  name: 'p.name ASC',
};

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function requestedRange(req, res) {
  const period = String(req.query.period || "month").toLowerCase();
  if (!PERIODS.has(period)) {
    res.status(400).json({ error: "Invalid reporting period" });
    return null;
  }
  if (period === "custom" && (!req.query.from || !req.query.to)) {
    res.status(400).json({ error: "from and to are required for a custom date range" });
    return null;
  }
  const range = profitRange(period, req.query.from, req.query.to);
  if (!range) {
    res.status(400).json({ error: "Enter a valid date range" });
    return null;
  }
  return { period, range };
}

const METRICS_QUERY = `WITH metrics AS (
  SELECT si."productId" AS id,
         COUNT(DISTINCT s.id)::int AS "saleCount",
         COALESCE(SUM(si.quantity), 0)::bigint AS "unitsSold",
         COALESCE(SUM(si."totalPrice"), 0)::bigint AS revenue,
         COALESCE(SUM(CASE WHEN si."buyingPrice" > 0 THEN si."buyingPrice" * si.quantity ELSE 0 END), 0)::bigint AS "knownCostOfGoodsSold",
         COALESCE(SUM(CASE WHEN si."buyingPrice" > 0 THEN si."totalPrice" ELSE 0 END), 0)::bigint AS "knownCostRevenue",
         COALESCE(SUM(CASE WHEN si."buyingPrice" > 0 THEN si."totalPrice" - si."buyingPrice" * si.quantity ELSE 0 END), 0)::bigint AS "grossProfit",
         COALESCE(SUM(CASE WHEN si."buyingPrice" <= 0 THEN si."totalPrice" ELSE 0 END), 0)::bigint AS "missingCostSalesRevenue",
         COALESCE(SUM(CASE WHEN s."pricingTier" = 'RETAIL' THEN si.quantity ELSE 0 END), 0)::bigint AS "retailUnits",
         COALESCE(SUM(CASE WHEN s."pricingTier" = 'WHOLESALE' THEN si.quantity ELSE 0 END), 0)::bigint AS "wholesaleUnits",
         MAX(s."createdAt") AS "lastSoldAt"
  FROM sales s
  JOIN sale_items si ON si."saleId" = s.id
  WHERE s."shopId" = $1 AND s.status = 'COMPLETED'
    AND s."createdAt" >= $2 AND s."createdAt" < $3
    AND si."productId" IS NOT NULL
  GROUP BY si."productId"
)
SELECT p.id, p.name, p.sku, p.unit, p."isActive", p."isInternalUse",
       p."currentStock", p."minimumStock", p."buyingPrice", p."sellingPrice", p."wholesalePrice",
       COALESCE(m."saleCount", 0)::int AS "saleCount",
       COALESCE(m."unitsSold", 0)::bigint AS "unitsSold",
       COALESCE(m.revenue, 0)::bigint AS revenue,
       COALESCE(m."knownCostOfGoodsSold", 0)::bigint AS "knownCostOfGoodsSold",
       COALESCE(m."knownCostRevenue", 0)::bigint AS "knownCostRevenue",
       COALESCE(m."grossProfit", 0)::bigint AS "grossProfit",
       COALESCE(m."missingCostSalesRevenue", 0)::bigint AS "missingCostSalesRevenue",
       COALESCE(m."retailUnits", 0)::bigint AS "retailUnits",
       COALESCE(m."wholesaleUnits", 0)::bigint AS "wholesaleUnits",
       m."lastSoldAt",
       CASE WHEN COALESCE(m."knownCostRevenue", 0) > 0
         THEN ROUND(m."grossProfit"::numeric * 100 / m."knownCostRevenue", 1)::double precision
         ELSE NULL END AS "grossMargin"
FROM products p
LEFT JOIN metrics m ON m.id = p.id
WHERE p."shopId" = $1`;

function metric(row) {
  const fields = ["currentStock", "minimumStock", "buyingPrice", "sellingPrice", "wholesalePrice", "saleCount", "unitsSold", "revenue", "knownCostOfGoodsSold", "knownCostRevenue", "grossProfit", "missingCostSalesRevenue", "retailUnits", "wholesaleUnits", "grossMargin"];
  const result = { ...row };
  for (const field of fields) result[field] = row[field] == null ? null : Number(row[field]);
  result.averageSalePrice = result.unitsSold > 0 ? Math.round(result.revenue / result.unitsSold) : null;
  result.costCoveragePercent = result.revenue > 0
    ? Math.round(((result.revenue - result.missingCostSalesRevenue) / result.revenue) * 100)
    : null;
  return result;
}

async function productReturnRows(shopId, from, to) {
  return prisma.$queryRawUnsafe(
    `SELECT si."productId" AS id,
            COALESCE(SUM(sri.quantity), 0)::bigint AS units,
            COALESCE(SUM(sri."totalAmount"), 0)::bigint AS revenue,
            COALESCE(SUM(CASE WHEN sri."buyingPrice" > 0 THEN sri."buyingPrice" * sri."restockQuantity" ELSE 0 END), 0)::bigint AS "restockedCost",
            COALESCE(SUM(CASE WHEN sri."buyingPrice" > 0 THEN sri."totalAmount" ELSE 0 END), 0)::bigint AS "knownRevenue",
            COALESCE(SUM(CASE WHEN sri."buyingPrice" > 0 THEN sri."totalAmount" - sri."buyingPrice" * sri."restockQuantity" ELSE 0 END), 0)::bigint AS "profitReduction",
            COALESCE(SUM(CASE WHEN sri."buyingPrice" <= 0 THEN sri."totalAmount" ELSE 0 END), 0)::bigint AS "missingCostRevenue"
     FROM sale_return_items sri JOIN sale_returns sr ON sr.id = sri."saleReturnId"
     JOIN sale_items si ON si.id = sri."saleItemId"
     WHERE sr."shopId" = $1 AND si."productId" IS NOT NULL AND sr."createdAt" >= $2 AND sr."createdAt" < $3
     GROUP BY si."productId"`,
    shopId, from, to,
  );
}

function applyReturns(row, returned) {
  if (!returned) return metric(row);
  return metric({
    ...row,
    unitsSold: Number(row.unitsSold || 0) - Number(returned.units || 0),
    revenue: Number(row.revenue || 0) - Number(returned.revenue || 0),
    knownCostOfGoodsSold: Number(row.knownCostOfGoodsSold || 0) - Number(returned.restockedCost || 0),
    knownCostRevenue: Number(row.knownCostRevenue || 0) - Number(returned.knownRevenue || 0),
    grossProfit: Number(row.grossProfit || 0) - Number(returned.profitReduction || 0),
    missingCostSalesRevenue: Number(row.missingCostSalesRevenue || 0) - Number(returned.missingCostRevenue || 0),
    returnedUnits: Number(returned.units || 0),
    returnedRevenue: Number(returned.revenue || 0),
  });
}

const list = asyncHandler(async (req, res) => {
  const selection = requestedRange(req, res);
  if (!selection) return;
  const shopId = await getShopIdForUser(req.user);
  const search = String(req.query.search || "").trim().slice(0, 100);
  const status = String(req.query.status || "all").toLowerCase();
  const sort = String(req.query.sort || "revenue").toLowerCase();
  const page = Number(req.query.page || 1);
  const limit = Number(req.query.limit || 25);
  if (!["all", "active", "inactive"].includes(status) || !SORTS[sort] || !Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    return res.status(400).json({ error: "Invalid product report filters" });
  }
  const offset = (page - 1) * limit;
  if (!Number.isSafeInteger(offset)) return res.status(400).json({ error: "Invalid product report page" });
  const productWhere = {
    shopId,
    ...(status === "all" ? {} : { isActive: status === "active" }),
    ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }] } : {}),
  };
  const [rows, total, returns] = await Promise.all([
    prisma.$queryRawUnsafe(
      `${METRICS_QUERY} AND ($4 = '' OR STRPOS(LOWER(p.name), LOWER($4)) > 0 OR STRPOS(LOWER(COALESCE(p.sku, '')), LOWER($4)) > 0)
       AND ($5 = 'all' OR p."isActive" = ($5 = 'active'))
       ORDER BY ${SORTS[sort]}, p.name ASC, p.id ASC LIMIT $6 OFFSET $7`,
      shopId, selection.range.from, selection.range.to, search, status, limit, offset,
    ),
    prisma.product.count({ where: productWhere }),
    productReturnRows(shopId, selection.range.from, selection.range.to),
  ]);
  const returnsByProduct = new Map(returns.map((row) => [row.id, row]));
  res.json({
    period: selection.period,
    from: selection.range.from,
    to: selection.range.to,
    page, limit, total,
    products: rows.map((row) => applyReturns(row, returnsByProduct.get(row.id))),
  });
});

const detail = asyncHandler(async (req, res) => {
  const selection = requestedRange(req, res);
  if (!selection) return;
  const shopId = await getShopIdForUser(req.user);
  const productId = String(req.params.id || "");
  const previous = previousComparableRange(selection.period, selection.range);
  const bucket = selection.period === "today" ? "hour" : selection.period === "year" ? "month" : "day";
  const bucketSql = `date_trunc('${bucket}', s."createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam')`;
  const bucketLabel = bucket === "hour" ? "YYYY-MM-DD HH24:00" : bucket === "month" ? "YYYY-MM" : "YYYY-MM-DD";
  const itemWhere = { productId, sale: { shopId, status: "COMPLETED", createdAt: { gte: selection.range.from, lt: selection.range.to } } };
  const [currentRows, previousRows, trendRows, recentItems, currentReturns, previousReturns, returnTrendRows, recentReturns] = await Promise.all([
    prisma.$queryRawUnsafe(`${METRICS_QUERY} AND p.id = $4`, shopId, selection.range.from, selection.range.to, productId),
    prisma.$queryRawUnsafe(`${METRICS_QUERY} AND p.id = $4`, shopId, previous.from, previous.to, productId),
    prisma.$queryRawUnsafe(
      `SELECT to_char(${bucketSql}, '${bucketLabel}') AS label,
              COALESCE(SUM(si.quantity), 0)::bigint AS units,
              COALESCE(SUM(si."totalPrice"), 0)::bigint AS revenue,
              COALESCE(SUM(CASE WHEN si."buyingPrice" > 0 THEN si."totalPrice" - si."buyingPrice" * si.quantity ELSE 0 END), 0)::bigint AS "grossProfit"
       FROM sales s JOIN sale_items si ON si."saleId" = s.id
       WHERE s."shopId" = $1 AND si."productId" = $4 AND s.status = 'COMPLETED'
         AND s."createdAt" >= $2 AND s."createdAt" < $3
       GROUP BY ${bucketSql} ORDER BY ${bucketSql} ASC`,
      shopId, selection.range.from, selection.range.to, productId,
    ),
    prisma.saleItem.findMany({
      where: itemWhere,
      select: {
        id: true, quantity: true, unitPrice: true, buyingPrice: true, totalPrice: true,
        sale: { select: { id: true, receiptNumber: true, createdAt: true, paymentMethod: true, pricingTier: true, channel: true } },
      },
      orderBy: { sale: { createdAt: "desc" } },
      take: 10,
    }),
    productReturnRows(shopId, selection.range.from, selection.range.to),
    productReturnRows(shopId, previous.from, previous.to),
    prisma.$queryRawUnsafe(
      `SELECT to_char(date_trunc('${bucket}', sr."createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam'), '${bucketLabel}') AS label,
              COALESCE(SUM(sri.quantity), 0)::bigint AS units,
              COALESCE(SUM(sri."totalAmount"), 0)::bigint AS revenue,
              COALESCE(SUM(CASE WHEN sri."buyingPrice" > 0 THEN sri."totalAmount" - sri."buyingPrice" * sri."restockQuantity" ELSE 0 END), 0)::bigint AS "profitReduction"
       FROM sale_returns sr JOIN sale_return_items sri ON sri."saleReturnId" = sr.id JOIN sale_items si ON si.id = sri."saleItemId"
       WHERE sr."shopId" = $1 AND si."productId" = $4 AND sr."createdAt" >= $2 AND sr."createdAt" < $3
       GROUP BY 1 ORDER BY 1 ASC`,
      shopId, selection.range.from, selection.range.to, productId,
    ),
    prisma.saleReturnItem.findMany({
      where: { saleItem: { productId, sale: { shopId } }, saleReturn: { createdAt: { gte: selection.range.from, lt: selection.range.to } } },
      select: { id: true, quantity: true, restockQuantity: true, damagedQuantity: true, unitPrice: true, totalAmount: true, saleReturn: { select: { id: true, reason: true, refundAmount: true, debtReduction: true, refundMethod: true, createdAt: true, sale: { select: { receiptNumber: true } } } } },
      orderBy: { saleReturn: { createdAt: "desc" } }, take: 10,
    }),
  ]);
  if (!currentRows.length) return res.status(404).json({ error: "Product not found" });
  const currentReturn = currentReturns.find((row) => row.id === productId);
  const previousReturn = previousReturns.find((row) => row.id === productId);
  const trendByLabel = new Map(trendRows.map((row) => [row.label, { label: row.label, units: Number(row.units), revenue: Number(row.revenue), grossProfit: Number(row.grossProfit) }]));
  for (const row of returnTrendRows) {
    const bucketRow = trendByLabel.get(row.label) || { label: row.label, units: 0, revenue: 0, grossProfit: 0 };
    bucketRow.units -= Number(row.units || 0);
    bucketRow.revenue -= Number(row.revenue || 0);
    bucketRow.grossProfit -= Number(row.profitReduction || 0);
    trendByLabel.set(row.label, bucketRow);
  }
  res.json({
    period: selection.period,
    from: selection.range.from,
    to: selection.range.to,
    compareFrom: previous.from,
    compareTo: previous.to,
    product: applyReturns(currentRows[0], currentReturn),
    previous: previousRows.length ? applyReturns(previousRows[0], previousReturn) : null,
    trend: [...trendByLabel.values()].sort((a, b) => a.label.localeCompare(b.label)),
    recentReturns: recentReturns.map((item) => ({
      id: item.id,
      saleReturnId: item.saleReturn.id,
      receiptNumber: item.saleReturn.sale.receiptNumber,
      reason: item.saleReturn.reason,
      createdAt: item.saleReturn.createdAt,
      quantity: item.quantity,
      restockQuantity: item.restockQuantity,
      damagedQuantity: item.damagedQuantity,
      amount: item.totalAmount,
      refundAmount: item.saleReturn.refundAmount,
      debtReduction: item.saleReturn.debtReduction,
      refundMethod: item.saleReturn.refundMethod,
    })),
    recentSales: recentItems.map((item) => ({
      id: item.id,
      saleId: item.sale.id,
      receiptNumber: item.sale.receiptNumber,
      createdAt: item.sale.createdAt,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      knownCostGrossProfit: item.buyingPrice > 0 ? item.totalPrice - item.buyingPrice * item.quantity : null,
      paymentMethod: item.sale.paymentMethod,
      pricingTier: item.sale.pricingTier,
      channel: item.sale.channel,
    })),
  });
});

module.exports = { list, detail };
