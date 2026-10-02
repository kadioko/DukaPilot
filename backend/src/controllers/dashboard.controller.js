const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { startOfTanzaniaDay, startOfTanzaniaWeek, startOfTanzaniaMonth, lastSevenTanzaniaDays, tanzaniaDateKey } = require("../lib/businessTime");
const { featureSnapshot } = require("../lib/entitlements");
const { dashboardHistory } = require("../services/dashboard-cache.service");
const TANZANIA_OFFSET_MS = 3 * 60 * 60 * 1000;

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function costQualityQuery(shopId, from, to) {
  return prisma.$queryRawUnsafe(
    `SELECT
       COALESCE((SELECT SUM(si.\"totalPrice\" - si.\"buyingPrice\" * si.quantity) FROM sales s JOIN sale_items si ON si.\"saleId\" = s.id WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND si.\"buyingPrice\" > 0 AND ($2::timestamptz IS NULL OR s.\"createdAt\" >= $2) AND ($3::timestamptz IS NULL OR s.\"createdAt\" < $3)), 0)::bigint AS \"knownCostGrossProfit\",
       COALESCE((SELECT SUM(si.\"totalPrice\") FROM sales s JOIN sale_items si ON si.\"saleId\" = s.id WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND si.\"buyingPrice\" <= 0 AND ($2::timestamptz IS NULL OR s.\"createdAt\" >= $2) AND ($3::timestamptz IS NULL OR s.\"createdAt\" < $3)), 0)
         + COALESCE((SELECT SUM(s.\"totalAmount\") FROM sales s WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.\"saleId\" = s.id) AND ($2::timestamptz IS NULL OR s.\"createdAt\" >= $2) AND ($3::timestamptz IS NULL OR s.\"createdAt\" < $3)), 0)::bigint AS \"missingCostSalesRevenue\"`,
    shopId, from, to,
  );
}

function startOf(period, now = new Date()) {
  if (period === "today") return startOfTanzaniaDay(now);
  if (period === "week") return startOfTanzaniaWeek(now);
  if (period === "month") return startOfTanzaniaMonth(now);
  if (period === "all") return null;
  return startOfTanzaniaDay(now);
}

function startOfTanzaniaDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const date = new Date(Date.UTC(year, month - 1, day) - TANZANIA_OFFSET_MS);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfTanzaniaDate(value) {
  const start = startOfTanzaniaDate(value);
  return start ? new Date(start.getTime() + 24 * 60 * 60 * 1000) : null;
}

function shiftTanzaniaCalendar(value, { days = 0, months = 0 }) {
  const local = new Date(value.getTime() + TANZANIA_OFFSET_MS);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  const day = local.getUTCDate();
  const hours = local.getUTCHours();
  const minutes = local.getUTCMinutes();
  const seconds = local.getUTCSeconds();
  const milliseconds = local.getUTCMilliseconds();
  if (months) {
    const targetMonth = year * 12 + month + months;
    const targetYear = Math.floor(targetMonth / 12);
    const targetMonthIndex = ((targetMonth % 12) + 12) % 12;
    const targetDay = Math.min(day, new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate());
    return new Date(Date.UTC(targetYear, targetMonthIndex, targetDay, hours, minutes, seconds, milliseconds) - TANZANIA_OFFSET_MS);
  }
  return new Date(Date.UTC(year, month, day + days, hours, minutes, seconds, milliseconds) - TANZANIA_OFFSET_MS);
}

function previousComparableRange(period, range) {
  const shift = period === "today" ? { days: -1 }
    : period === "week" ? { days: -7 }
      : period === "month" ? { months: -1 }
        : period === "quarter" ? { months: -3 }
          : period === "year" ? { months: -12 }
            : null;
  if (!shift) return { from: new Date(range.from.getTime() - (range.to.getTime() - range.from.getTime())), to: range.from };
  return { from: shiftTanzaniaCalendar(range.from, shift), to: shiftTanzaniaCalendar(range.to, shift) };
}

function profitRange(period, fromInput, toInput, now = new Date()) {
  const currentEnd = new Date(now.getTime() + 1);
  if (period === "today") return { from: startOfTanzaniaDay(now), to: currentEnd };
  if (period === "week") return { from: startOfTanzaniaWeek(now), to: currentEnd };
  if (period === "month") {
    const from = startOfTanzaniaMonth(now);
    return { from, to: currentEnd };
  }
  if (period === "quarter") {
    const shifted = new Date(now.getTime() + TANZANIA_OFFSET_MS);
    const quarterMonth = Math.floor(shifted.getUTCMonth() / 3) * 3;
    return { from: new Date(Date.UTC(shifted.getUTCFullYear(), quarterMonth, 1) - TANZANIA_OFFSET_MS), to: currentEnd };
  }
  if (period === "year") {
    const shifted = new Date(now.getTime() + TANZANIA_OFFSET_MS);
    return { from: new Date(Date.UTC(shifted.getUTCFullYear(), 0, 1) - TANZANIA_OFFSET_MS), to: currentEnd };
  }
  const from = startOfTanzaniaDate(fromInput);
  const to = endOfTanzaniaDate(toInput);
  if (!from || !to || from >= to || to.getTime() - from.getTime() > 366 * 86400000) return null;
  return { from, to };
}

const overview = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const now = new Date();
  const { period = "today" } = req.query;
  const from = startOf(period, now);
  const salesWhere = from ? { shopId, status: "COMPLETED", createdAt: { gte: from } } : { shopId, status: "COMPLETED" };
  const activeProductsWhere = { shopId, isActive: true };

  const [shopPlan, salesAgg, expenseAgg, salesCount, totalProducts, lowStockCandidates, lowStockCountRows, outOfStockCount, pendingOrders, recentSales] = await Promise.all([
    prisma.shop.findUnique({ where: { id: shopId }, select: { plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true } }),
    prisma.sale.aggregate({
      where: salesWhere,
      _sum: { totalAmount: true, profit: true },
    }),
    prisma.expense.aggregate({
      where: salesWhere.createdAt ? { shopId, category: { not: "STOCK" }, spentAt: salesWhere.createdAt } : { shopId, category: { not: "STOCK" } },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.sale.count({ where: salesWhere }),
    prisma.product.count({ where: activeProductsWhere }),
    prisma.$queryRawUnsafe(
      `SELECT id, name, "currentStock", "minimumStock", unit, "buyingPrice", "sellingPrice"
       FROM products
       WHERE "shopId" = $1 AND "isActive" = true AND "currentStock" <= "minimumStock"
       ORDER BY "currentStock" ASC, name ASC LIMIT 50`,
      shopId,
    ),
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM products
       WHERE "shopId" = $1 AND "isActive" = true AND "currentStock" > 0 AND "currentStock" <= "minimumStock"`,
      shopId,
    ),
    prisma.product.count({ where: { ...activeProductsWhere, currentStock: 0 } }),
    prisma.order.count({ where: { shopId, status: { in: ["PENDING", "CONFIRMED", "OUT_FOR_DELIVERY"] } } }),
    prisma.sale.findMany({
      where: salesWhere,
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, totalAmount: true, profit: true, paymentMethod: true, createdAt: true },
    }),
  ]);

  const lowStockProducts = lowStockCandidates.filter((p) => p.currentStock > 0);
  const outOfStockProducts = lowStockCandidates.filter((p) => p.currentStock === 0);
  const needsAttentionProducts = [...outOfStockProducts, ...lowStockProducts];

  const chartDays = lastSevenTanzaniaDays(now);
  const dailySales = await prisma.$queryRawUnsafe(
    `WITH daily_sales AS (
       SELECT to_char("createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam', 'YYYY-MM-DD') AS date,
              COALESCE(SUM("totalAmount"), 0)::bigint AS sales
       FROM sales WHERE "shopId" = $1 AND status = 'COMPLETED' AND "createdAt" >= $2 GROUP BY 1
     ), daily_profit AS (
       SELECT to_char(s."createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam', 'YYYY-MM-DD') AS date,
              COALESCE(SUM(si."totalPrice" - si."buyingPrice" * si.quantity) FILTER (WHERE si."buyingPrice" > 0), 0)::bigint AS profit
       FROM sales s JOIN sale_items si ON si."saleId" = s.id
       WHERE s."shopId" = $1 AND s.status = 'COMPLETED' AND s."createdAt" >= $2 GROUP BY 1
     )
     SELECT daily_sales.date, daily_sales.sales, COALESCE(daily_profit.profit, 0)::bigint AS profit
     FROM daily_sales LEFT JOIN daily_profit USING (date)`,
    shopId,
    chartDays[0],
  );

  const dailyMap = {};
  for (const day of chartDays) {
    const key = tanzaniaDateKey(day);
    dailyMap[key] = { date: key, sales: 0, profit: 0 };
  }
  for (const row of dailySales) {
    if (dailyMap[row.date]) {
      dailyMap[row.date].sales += Number(row.sales || 0);
      dailyMap[row.date].profit += Number(row.profit || 0);
    }
  }

  const topProducts = await prisma.saleItem.groupBy({
    by: ["productId"],
    where: from ? { sale: { shopId, status: "COMPLETED", createdAt: { gte: from } } } : { sale: { shopId, status: "COMPLETED" } },
    _sum: { quantity: true, totalPrice: true },
    orderBy: { _sum: { totalPrice: "desc" } },
    take: 5,
  });

  const topProductDetails = await prisma.product.findMany({
    where: { id: { in: topProducts.map((t) => t.productId) } },
    select: { id: true, name: true, unit: true },
  });
  const topProductMap = Object.fromEntries(topProductDetails.map((p) => [p.id, p]));

  const paymentBreakdownRaw = await prisma.sale.groupBy({
    by: ["paymentMethod"],
    where: salesWhere,
    _sum: { totalAmount: true },
    _count: { id: true },
    orderBy: { _sum: { totalAmount: "desc" } },
  });

  const { allTimeRows, historyRows, allExpenseAgg } = await dashboardHistory(shopId, async () => {
    const [allTimeRows, historyRows, allExpenseAgg] = await Promise.all([
      prisma.$queryRawUnsafe(
        `SELECT COALESCE(SUM("totalAmount"), 0)::bigint AS "totalSales",
                COALESCE(SUM(profit), 0)::bigint AS "totalProfit",
                COUNT(*)::int AS "salesCount", MIN("createdAt") AS "firstSaleAt"
         FROM sales WHERE "shopId" = $1 AND status = 'COMPLETED'`,
        shopId,
      ),
      prisma.$queryRawUnsafe(
        `WITH monthly_sales AS (
           SELECT date_trunc('month', "createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam') AS period,
                  COALESCE(SUM("totalAmount"), 0)::bigint AS sales, COUNT(*)::int AS "salesCount"
           FROM sales WHERE "shopId" = $1 AND status = 'COMPLETED' GROUP BY 1
         ), monthly_profit AS (
           SELECT date_trunc('month', s."createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam') AS period,
                  COALESCE(SUM(si."totalPrice" - si."buyingPrice" * si.quantity) FILTER (WHERE si."buyingPrice" > 0), 0)::bigint AS profit
           FROM sales s JOIN sale_items si ON si."saleId" = s.id
           WHERE s."shopId" = $1 AND s.status = 'COMPLETED' GROUP BY 1
         )
         SELECT to_char(monthly_sales.period, 'YYYY-MM') AS period, monthly_sales.sales,
                COALESCE(monthly_profit.profit, 0)::bigint AS profit, monthly_sales."salesCount"
         FROM monthly_sales LEFT JOIN monthly_profit USING (period) ORDER BY monthly_sales.period ASC`,
        shopId,
      ),
      prisma.expense.aggregate({ where: { shopId, category: { not: "STOCK" } }, _sum: { amount: true }, _count: { id: true } }),
    ]);
    return { allTimeRows, historyRows, allExpenseAgg };
  });
  const totalExpenses = expenseAgg._sum.amount || 0;
  const allTime = allTimeRows[0] || {};
  const allTimeSales = Number(allTime.totalSales || 0);
  const allTimeSalesCount = Number(allTime.salesCount || 0);
  const allTimeExpenses = allExpenseAgg._sum.amount || 0;
  const currentRange = from ? { from, to: new Date(now.getTime() + 1) } : null;
  const previousRange = currentRange && period !== "all" ? previousComparableRange(period, currentRange) : null;
  const [previousSales, previousExpenses, cashCollections, currentCostRows, allTimeCostRows, previousCostRows] = await Promise.all([
    previousRange ? prisma.sale.aggregate({
      where: { shopId, status: "COMPLETED", createdAt: { gte: previousRange.from, lt: previousRange.to } },
      _sum: { totalAmount: true, profit: true },
      _count: { id: true },
    }) : Promise.resolve(null),
    previousRange ? prisma.expense.aggregate({
      where: { shopId, category: { not: "STOCK" }, spentAt: { gte: previousRange.from, lt: previousRange.to } },
      _sum: { amount: true },
    }) : Promise.resolve(null),
    prisma.$queryRawUnsafe(
      `SELECT
         COALESCE((SELECT SUM(s."totalAmount") FROM sales s WHERE s."shopId" = $1 AND s.status = 'COMPLETED' AND s."paymentMethod" <> 'CREDIT' AND s."quotationId" IS NULL AND ($2::timestamptz IS NULL OR s."createdAt" >= $2) AND s."createdAt" < $3), 0)
         + COALESCE((SELECT SUM(CASE WHEN qp.kind = 'PAYMENT' THEN qp.amount ELSE -qp.amount END) FROM quotation_payments qp JOIN quotations q ON q.id = qp."quotationId" WHERE q."shopId" = $1 AND qp."paidAt" >= COALESCE($2, '-infinity'::timestamptz) AND qp."paidAt" < $3), 0)
         + COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp JOIN debts d ON d.id = dp."debtId" WHERE d."shopId" = $1 AND ($2::timestamptz IS NULL OR dp."createdAt" >= $2) AND dp."createdAt" < $3 AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.id = d."saleId" AND s."quotationId" IS NOT NULL)), 0)::bigint AS amount`,
      shopId, from, new Date(now.getTime() + 1),
    ),
    costQualityQuery(shopId, from, new Date(now.getTime() + 1)),
    costQualityQuery(shopId, null, null),
    previousRange ? costQualityQuery(shopId, previousRange.from, previousRange.to) : Promise.resolve([]),
  ]);
  const grossProfit = Number(currentCostRows[0]?.knownCostGrossProfit || 0);
  const missingCostSalesRevenue = Number(currentCostRows[0]?.missingCostSalesRevenue || 0);
  const allTimeProfit = Number(allTimeCostRows[0]?.knownCostGrossProfit || 0);
  const allTimeMissingCostSalesRevenue = Number(allTimeCostRows[0]?.missingCostSalesRevenue || 0);
  const previousGrossProfit = Number(previousCostRows[0]?.knownCostGrossProfit || 0);
  const comparisonCurrent = { sales: Number(salesAgg._sum.totalAmount || 0), grossProfit: Number(grossProfit), expenses: Number(totalExpenses), netProfit: Number(grossProfit - totalExpenses), salesCount: Number(salesCount) };
  const comparisonPrevious = previousSales ? {
    sales: Number(previousSales._sum.totalAmount || 0),
    grossProfit: previousGrossProfit,
    expenses: Number(previousExpenses?._sum.amount || 0),
    netProfit: previousGrossProfit - Number(previousExpenses?._sum.amount || 0),
    salesCount: Number(previousSales._count.id || 0),
  } : null;
  const comparison = comparisonPrevious ? Object.fromEntries(Object.entries(comparisonCurrent).map(([key, value]) => {
    const previous = comparisonPrevious[key];
    return [key, { current: value, previous, change: value - previous, changePercent: previous === 0 ? null : Number((((value - previous) / Math.abs(previous)) * 100).toFixed(1)) }];
  })) : null;

  res.json({
    period,
    features: featureSnapshot(shopPlan),
    summary: {
      totalSales: salesAgg._sum.totalAmount || 0,
      cashCollected: Number(cashCollections[0]?.amount || 0),
      creditSales: paymentBreakdownRaw.find((item) => item.paymentMethod === "CREDIT")?._sum.totalAmount || 0,
      totalProfit: grossProfit,
      missingCostSalesRevenue,
      costComplete: missingCostSalesRevenue === 0,
      totalExpenses,
      netProfit: grossProfit - totalExpenses,
      expenseCount: expenseAgg._count.id,
      salesCount,
      pendingOrders,
      totalProducts,
      lowStockCount: Number(lowStockCountRows[0]?.count || 0),
      outOfStockCount,
    },
    allTimeSummary: {
      totalSales: allTimeSales,
      totalProfit: allTimeProfit,
      missingCostSalesRevenue: allTimeMissingCostSalesRevenue,
      costComplete: allTimeMissingCostSalesRevenue === 0,
      totalExpenses: allTimeExpenses,
      netProfit: allTimeProfit - allTimeExpenses,
      expenseCount: allExpenseAgg._count.id,
      salesCount: allTimeSalesCount,
      firstSaleAt: allTime.firstSaleAt || null,
    },
    lowStockAlerts: needsAttentionProducts.map((p) => ({
      id: p.id,
      name: p.name,
      currentStock: p.currentStock,
      minimumStock: p.minimumStock,
      unit: p.unit,
      buyingPrice: p.buyingPrice,
      sellingPrice: p.sellingPrice,
    })),
    recentSales,
    dailyChart: Object.values(dailyMap),
    paymentBreakdown: paymentBreakdownRaw.map((item) => ({
      paymentMethod: item.paymentMethod,
      totalAmount: item._sum.totalAmount || 0,
      salesCount: item._count.id,
    })),
    historyTimeline: historyRows.map((row) => ({ period: row.period, sales: Number(row.sales || 0), profit: Number(row.profit || 0), salesCount: Number(row.salesCount || 0) })),
    topProducts: topProducts.map((t) => ({
      product: topProductMap[t.productId],
      totalQuantity: t._sum.quantity,
      totalRevenue: t._sum.totalPrice,
    })),
  });
});

const profitAnalytics = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const period = String(req.query.period || "today").toLowerCase();
  if (!["today", "week", "month", "quarter", "year", "custom"].includes(period)) {
    return res.status(400).json({ error: "period must be today, week, month, quarter, year, or custom" });
  }
  if (period === "custom" && (!req.query.from || !req.query.to)) {
    return res.status(400).json({ error: "from and to are required for a custom date range" });
  }
  const range = profitRange(period, req.query.from, req.query.to);
  if (!range) return res.status(400).json({ error: "Enter a valid date range" });

  const duration = range.to.getTime() - range.from.getTime();
  const previousRange = previousComparableRange(period, range);
  const days = Math.max(1, Math.ceil(duration / 86400000));
  const group = period === "today" ? "hour" : (period === "year" || days > 92 ? "month" : "day");
  const bucket = group === "hour"
    ? "date_trunc('hour', s.\"createdAt\" AT TIME ZONE 'Africa/Dar_es_Salaam')"
    : group === "month"
      ? "date_trunc('month', s.\"createdAt\" AT TIME ZONE 'Africa/Dar_es_Salaam')"
      : "date_trunc('day', s.\"createdAt\" AT TIME ZONE 'Africa/Dar_es_Salaam')";
  const expenseBucket = group === "hour"
    ? "date_trunc('hour', e.\"spentAt\" AT TIME ZONE 'Africa/Dar_es_Salaam')"
    : group === "month"
      ? "date_trunc('month', e.\"spentAt\" AT TIME ZONE 'Africa/Dar_es_Salaam')"
      : "date_trunc('day', e.\"spentAt\" AT TIME ZONE 'Africa/Dar_es_Salaam')";
  const label = group === "hour" ? "HH24:00" : group === "month" ? "Mon YYYY" : "YYYY-MM-DD";

  const summaryQuery = `SELECT
       COALESCE((SELECT SUM(s.\"totalAmount\") FROM sales s WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND s.\"createdAt\" >= $2 AND s.\"createdAt\" < $3), 0)::bigint AS \"salesRevenue\",
       COALESCE((SELECT SUM(s.\"totalAmount\") FROM sales s WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND s.\"paymentMethod\" <> 'CREDIT' AND s.\"quotationId\" IS NULL AND s.\"createdAt\" >= $2 AND s.\"createdAt\" < $3), 0)
         + COALESCE((SELECT SUM(CASE WHEN qp.kind = 'PAYMENT' THEN qp.amount ELSE -qp.amount END) FROM quotation_payments qp JOIN quotations q ON q.id = qp.\"quotationId\" WHERE q.\"shopId\" = $1 AND qp.\"paidAt\" >= $2 AND qp.\"paidAt\" < $3), 0)
         + COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp JOIN debts d ON d.id = dp.\"debtId\" WHERE d.\"shopId\" = $1 AND dp.\"createdAt\" >= $2 AND dp.\"createdAt\" < $3 AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.id = d.\"saleId\" AND s.\"quotationId\" IS NOT NULL)), 0)::bigint AS \"cashCollected\",
       COALESCE((SELECT SUM(s.\"totalAmount\") FROM sales s WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND s.\"paymentMethod\" = 'CREDIT' AND s.\"createdAt\" >= $2 AND s.\"createdAt\" < $3), 0)::bigint AS \"creditSales\",
       COALESCE((SELECT SUM(si.\"buyingPrice\" * si.quantity) FROM sales s JOIN sale_items si ON si.\"saleId\" = s.id WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND si.\"buyingPrice\" > 0 AND s.\"createdAt\" >= $2 AND s.\"createdAt\" < $3), 0)::bigint AS \"costOfGoodsSold\",
       COALESCE((SELECT SUM(si.\"totalPrice\") FROM sales s JOIN sale_items si ON si.\"saleId\" = s.id WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND si.\"buyingPrice\" > 0 AND s.\"createdAt\" >= $2 AND s.\"createdAt\" < $3), 0)::bigint AS \"knownCostRevenue\",
       COALESCE((SELECT SUM(si.\"totalPrice\" - si.\"buyingPrice\" * si.quantity) FROM sales s JOIN sale_items si ON si.\"saleId\" = s.id WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND si.\"buyingPrice\" > 0 AND s.\"createdAt\" >= $2 AND s.\"createdAt\" < $3), 0)::bigint AS \"knownCostGrossProfit\",
       (COALESCE((SELECT SUM(si.\"totalPrice\") FROM sales s JOIN sale_items si ON si.\"saleId\" = s.id WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND si.\"buyingPrice\" <= 0 AND s.\"createdAt\" >= $2 AND s.\"createdAt\" < $3), 0)
         + COALESCE((SELECT SUM(s.\"totalAmount\") FROM sales s WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.\"saleId\" = s.id) AND s.\"createdAt\" >= $2 AND s.\"createdAt\" < $3), 0))::bigint AS \"missingCostSalesRevenue\",
       (SELECT COUNT(*)::int FROM sales s WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND s.\"createdAt\" >= $2 AND s.\"createdAt\" < $3) AS \"salesCount\",
       COALESCE((SELECT SUM(si.quantity) FROM sales s JOIN sale_items si ON si.\"saleId\" = s.id WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND s.\"createdAt\" >= $2 AND s.\"createdAt\" < $3), 0)::bigint AS \"unitsSold\",
       COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.\"shopId\" = $1 AND e.category <> 'STOCK' AND e.\"spentAt\" >= $2 AND e.\"spentAt\" < $3), 0)::bigint AS expenses`;

  const [totalsRows, previousRows, chartRows, expenseChartRows, slowProductRows, productRows, debtAgingRows, collectionRows, productionAggregate, productionInputRows] = await Promise.all([
    prisma.$queryRawUnsafe(summaryQuery, shopId, range.from, range.to),
    previousRange ? prisma.$queryRawUnsafe(summaryQuery, shopId, previousRange.from, previousRange.to) : Promise.resolve([]),
    prisma.$queryRawUnsafe(
      `SELECT to_char(${bucket}, '${label}') AS label,
              to_char(${bucket}, 'YYYY-MM-DD HH24:MI') AS \"sortKey\",
              COALESCE(SUM(si.\"totalPrice\"), 0)::bigint AS revenue,
              COALESCE(SUM(CASE WHEN si.\"buyingPrice\" > 0 THEN si.\"buyingPrice\" * si.quantity ELSE 0 END), 0)::bigint AS cogs,
              COALESCE(SUM(CASE WHEN si.\"buyingPrice\" > 0 THEN si.\"totalPrice\" - (si.\"buyingPrice\" * si.quantity) ELSE 0 END), 0)::bigint AS profit
       FROM sales s
       JOIN sale_items si ON si.\"saleId\" = s.id
       WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND s.\"createdAt\" >= $2 AND s.\"createdAt\" < $3
       GROUP BY ${bucket}
       ORDER BY ${bucket} ASC`,
      shopId, range.from, range.to,
    ),
    prisma.$queryRawUnsafe(
      `SELECT to_char(${expenseBucket}, '${label}') AS label, to_char(${expenseBucket}, 'YYYY-MM-DD HH24:MI') AS \"sortKey\", COALESCE(SUM(e.amount), 0)::bigint AS expenses
       FROM expenses e WHERE e.\"shopId\" = $1 AND e.category <> 'STOCK' AND e.\"spentAt\" >= $2 AND e.\"spentAt\" < $3
       GROUP BY ${expenseBucket} ORDER BY ${expenseBucket} ASC`,
      shopId, range.from, range.to,
    ),
    prisma.$queryRawUnsafe(
      `SELECT p.id, p.name, p.unit, p.\"currentStock\", MAX(s.\"createdAt\") AS \"lastSoldAt\"
       FROM products p
       LEFT JOIN sale_items si ON si.\"productId\" = p.id
       LEFT JOIN sales s ON s.id = si.\"saleId\" AND s.\"shopId\" = p.\"shopId\" AND s.status = 'COMPLETED' AND s.\"createdAt\" >= NOW() - INTERVAL '30 days'
       WHERE p.\"shopId\" = $1 AND p.\"isActive\" = true AND p.\"currentStock\" > 0
       GROUP BY p.id, p.name, p.unit, p.\"currentStock\"
       HAVING MAX(s.\"createdAt\") IS NULL
       ORDER BY p.\"currentStock\" DESC, p.name ASC LIMIT 10`,
      shopId,
    ),
    prisma.$queryRawUnsafe(
      `SELECT COALESCE(p.id, 'unlinked:' || MAX(COALESCE(si.name, si.description, 'Item')) || '|' || MAX(COALESCE(si.unit, ''))) AS id,
              COALESCE(p.name, MAX(COALESCE(si.name, si.description, 'Item'))) AS name,
              COALESCE(p.unit, MAX(COALESCE(si.unit, ''))) AS unit,
              COALESCE(p.\"currentStock\", 0)::double precision AS \"currentStock\",
              COALESCE(SUM(si.quantity), 0)::bigint AS quantity,
              COALESCE(SUM(si.\"totalPrice\"), 0)::bigint AS revenue,
              COALESCE(SUM(CASE WHEN si.\"buyingPrice\" > 0 THEN si.\"totalPrice\" - si.\"buyingPrice\" * si.quantity ELSE 0 END), 0)::bigint AS \"knownCostGrossProfit\",
              COALESCE(SUM(CASE WHEN si.\"buyingPrice\" <= 0 THEN si.\"totalPrice\" ELSE 0 END), 0)::bigint AS \"missingCostSalesRevenue\",
              MAX(s.\"createdAt\") AS \"lastSoldAt\"
       FROM sales s JOIN sale_items si ON si.\"saleId\" = s.id
       LEFT JOIN products p ON p.id = si.\"productId\"
       WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND s.\"createdAt\" >= $2 AND s.\"createdAt\" < $3
       GROUP BY p.id, p.name, p.unit, p.\"currentStock\",
                CASE WHEN p.id IS NULL THEN COALESCE(si.name, si.description, 'Item') END,
                CASE WHEN p.id IS NULL THEN si.unit END
       ORDER BY \"knownCostGrossProfit\" DESC, revenue DESC LIMIT 10`,
      shopId, range.from, range.to,
    ),
    prisma.$queryRawUnsafe(
      `SELECT
         COALESCE(SUM(CASE WHEN d.\"dueDate\" < NOW() THEN GREATEST(d.amount - d.\"amountPaid\", 0) ELSE 0 END), 0)::bigint AS overdue,
         COALESCE(SUM(CASE WHEN d.\"dueDate\" >= NOW() AND d.\"dueDate\" < NOW() + INTERVAL '7 days' THEN GREATEST(d.amount - d.\"amountPaid\", 0) ELSE 0 END), 0)::bigint AS \"dueSoon\",
         COALESCE(SUM(CASE WHEN d.\"dueDate\" IS NULL THEN GREATEST(d.amount - d.\"amountPaid\", 0) ELSE 0 END), 0)::bigint AS \"noDueDate\",
         COALESCE(SUM(GREATEST(d.amount - d.\"amountPaid\", 0)), 0)::bigint AS outstanding
       FROM debts d WHERE d.\"shopId\" = $1 AND d.status IN ('OPEN', 'PARTIAL')`,
      shopId,
    ),
    prisma.$queryRawUnsafe(
      `SELECT method AS \"paymentMethod\", COALESCE(SUM(amount), 0)::bigint AS amount FROM (
         SELECT s.\"paymentMethod\" AS method, s.\"totalAmount\" AS amount FROM sales s
         WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND s.\"paymentMethod\" <> 'CREDIT' AND s.\"quotationId\" IS NULL AND s.\"createdAt\" >= $2 AND s.\"createdAt\" < $3
         UNION ALL
         SELECT dp.\"paymentMethod\" AS method, dp.amount FROM debt_payments dp JOIN debts d ON d.id = dp.\"debtId\"
         WHERE d.\"shopId\" = $1 AND dp.\"createdAt\" >= $2 AND dp.\"createdAt\" < $3 AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.id = d.\"saleId\" AND s.\"quotationId\" IS NOT NULL)
         UNION ALL
         SELECT qp.\"paymentMethod\" AS method, CASE WHEN qp.kind = 'PAYMENT' THEN qp.amount ELSE -qp.amount END AS amount
         FROM quotation_payments qp JOIN quotations q ON q.id = qp.\"quotationId\"
         WHERE q.\"shopId\" = $1 AND qp.\"paidAt\" >= $2 AND qp.\"paidAt\" < $3
       ) collections GROUP BY method ORDER BY amount DESC`,
      shopId, range.from, range.to,
    ),
    prisma.farmProductionBatch.aggregate({
      where: { shopId, producedAt: { gte: range.from, lt: range.to } },
      _sum: { actualYield: true, brokenQuantity: true, wasteQuantity: true, ingredientCost: true, additionalCost: true, totalCost: true },
      _count: { id: true },
    }),
    prisma.farmProductionItem.groupBy({
      by: ["productId"],
      where: { farmProduction: { shopId, producedAt: { gte: range.from, lt: range.to } } },
      _sum: { quantity: true, totalCost: true },
    }),
  ]);

  const totals = totalsRows[0] || {};
  const revenue = Number(totals.salesRevenue || 0);
  const costOfGoodsSold = Number(totals.costOfGoodsSold || 0);
  const grossProfit = Number(totals.knownCostGrossProfit || 0);
  const expenses = Number(totals.expenses || 0);
  const inputProducts = productionInputRows.length
    ? await prisma.product.findMany({ where: { id: { in: productionInputRows.map((row) => row.productId) }, shopId }, select: { id: true, name: true, unit: true } })
    : [];
  const inputProductById = new Map(inputProducts.map((product) => [product.id, product]));
  const production = {
    batchCount: Number(productionAggregate._count?.id || 0),
    grossOutput: Number(productionAggregate._sum?.actualYield || 0),
    brokenEggs: Number(productionAggregate._sum?.brokenQuantity || 0),
    usableOutput: Number(productionAggregate._sum?.actualYield || 0) - Number(productionAggregate._sum?.brokenQuantity || 0),
    productionVariance: Number(productionAggregate._sum?.wasteQuantity || 0),
    ingredientCost: Number(productionAggregate._sum?.ingredientCost || 0),
    directCost: Number(productionAggregate._sum?.additionalCost || 0),
    totalCost: Number(productionAggregate._sum?.totalCost || 0),
    inputs: productionInputRows.map((row) => ({
      productId: row.productId,
      name: inputProductById.get(row.productId)?.name || "Supply",
      unit: inputProductById.get(row.productId)?.unit || "",
      quantity: Number(row._sum?.quantity || 0),
      cost: Number(row._sum?.totalCost || 0),
    })).sort((a, b) => b.cost - a.cost),
  };
  const currentSummary = {
    salesRevenue: revenue,
    cashCollected: Number(totals.cashCollected || 0),
    creditSales: Number(totals.creditSales || 0),
    costOfGoodsSold,
    grossProfit,
    grossProfitMargin: Number(totals.knownCostRevenue || 0) > 0 ? Number(((grossProfit / Number(totals.knownCostRevenue)) * 100).toFixed(1)) : 0,
    expenses,
    netProfit: grossProfit - expenses,
    salesCount: Number(totals.salesCount || 0),
    unitsSold: Number(totals.unitsSold || 0),
    missingCostSalesRevenue: Number(totals.missingCostSalesRevenue || 0),
    knownCostRevenue: Number(totals.knownCostRevenue || 0),
  };
  currentSummary.costComplete = currentSummary.missingCostSalesRevenue === 0;
  const previous = previousRows[0];
  const chartByBucket = new Map();
  for (const row of chartRows) chartByBucket.set(row.sortKey || row.label, {
    label: row.label,
    sortKey: row.sortKey || row.label,
    revenue: Number(row.revenue || 0),
    costOfGoodsSold: Number(row.cogs || 0),
    grossProfit: Number(row.profit || 0),
    expenses: 0,
  });
  for (const row of expenseChartRows) {
    const key = row.sortKey || row.label;
    const bucketRow = chartByBucket.get(key) || { label: row.label, sortKey: key, revenue: 0, costOfGoodsSold: 0, grossProfit: 0, expenses: 0 };
    bucketRow.expenses = Number(row.expenses || 0);
    chartByBucket.set(key, bucketRow);
  }
  const previousSummary = previous ? {
    salesRevenue: Number(previous.salesRevenue || 0),
    cashCollected: Number(previous.cashCollected || 0),
    creditSales: Number(previous.creditSales || 0),
    costOfGoodsSold: Number(previous.costOfGoodsSold || 0),
    grossProfit: Number(previous.knownCostGrossProfit || 0),
    grossProfitMargin: Number(previous.knownCostRevenue || 0) > 0 ? Number(((Number(previous.knownCostGrossProfit || 0) / Number(previous.knownCostRevenue)) * 100).toFixed(1)) : 0,
    expenses: Number(previous.expenses || 0),
    netProfit: Number(previous.knownCostGrossProfit || 0) - Number(previous.expenses || 0),
    salesCount: Number(previous.salesCount || 0),
  } : null;
  const comparison = previousSummary ? Object.fromEntries(
    ["salesRevenue", "cashCollected", "creditSales", "costOfGoodsSold", "grossProfit", "grossProfitMargin", "expenses", "netProfit", "salesCount"].map((key) => {
      const current = currentSummary[key];
      const prior = previousSummary[key];
      return [key, { current, previous: prior, change: current - prior, changePercent: prior === 0 ? null : Number((((current - prior) / Math.abs(prior)) * 100).toFixed(1)) }];
    }),
  ) : null;
  res.json({
    period,
    from: range.from,
    to: range.to,
    group,
    compareFrom: previousRange?.from || null,
    compareTo: previousRange?.to || null,
    summary: currentSummary,
    production,
    previousSummary,
    comparison,
    debtAging: {
      overdue: Number(debtAgingRows[0]?.overdue || 0),
      dueSoon: Number(debtAgingRows[0]?.dueSoon || 0),
      noDueDate: Number(debtAgingRows[0]?.noDueDate || 0),
      outstanding: Number(debtAgingRows[0]?.outstanding || 0),
    },
    collectionBreakdown: collectionRows.map((row) => ({ paymentMethod: row.paymentMethod, amount: Number(row.amount || 0) })),
    products: productRows.map((row) => ({
      id: row.id,
      name: row.name,
      unit: row.unit,
      currentStock: Number(row.currentStock || 0),
      quantity: Number(row.quantity || 0),
      revenue: Number(row.revenue || 0),
      grossProfit: Number(row.knownCostGrossProfit || 0),
      missingCostSalesRevenue: Number(row.missingCostSalesRevenue || 0),
      lastSoldAt: row.lastSoldAt,
    })),
    slowMovingProducts: slowProductRows.map((row) => ({ id: row.id, name: row.name, unit: row.unit, currentStock: Number(row.currentStock || 0) })),
    chart: [...chartByBucket.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey)).map((row) => ({
      label: row.label,
      revenue: row.revenue,
      costOfGoodsSold: row.costOfGoodsSold,
      grossProfit: row.grossProfit,
      expenses: row.expenses,
      netProfit: row.grossProfit - row.expenses,
    })),
  });
});

module.exports = { overview, profitAnalytics, startOf, profitRange };
