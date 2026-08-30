const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { startOfTanzaniaDay, startOfTanzaniaMonth, tanzaniaDateKey } = require("../lib/businessTime");
const { featureSnapshot } = require("../lib/entitlements");
const { dashboardHistory } = require("../services/dashboard-cache.service");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function startOf(period) {
  const now = new Date();
  if (period === "today") return startOfTanzaniaDay(now);
  if (period === "week") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (period === "month") return startOfTanzaniaMonth(now);
  if (period === "all") return null;
  return startOfTanzaniaDay(now);
}

const TANZANIA_OFFSET_MS = 3 * 60 * 60 * 1000;

function startOfTanzaniaDate(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(Date.UTC(year, month - 1, day) - TANZANIA_OFFSET_MS);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfTanzaniaDate(value) {
  const start = startOfTanzaniaDate(value);
  return start ? new Date(start.getTime() + 24 * 60 * 60 * 1000) : null;
}

function profitRange(period, fromInput, toInput) {
  const now = new Date();
  if (period === "today") return { from: startOfTanzaniaDay(now), to: new Date(startOfTanzaniaDay(now).getTime() + 86400000) };
  if (period === "month") {
    const from = startOfTanzaniaMonth(now);
    const shifted = new Date(now.getTime() + TANZANIA_OFFSET_MS);
    const to = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1) - TANZANIA_OFFSET_MS);
    return { from, to };
  }
  if (period === "quarter") {
    const shifted = new Date(now.getTime() + TANZANIA_OFFSET_MS);
    const quarterMonth = Math.floor(shifted.getUTCMonth() / 3) * 3;
    return {
      from: new Date(Date.UTC(shifted.getUTCFullYear(), quarterMonth, 1) - TANZANIA_OFFSET_MS),
      to: new Date(Date.UTC(shifted.getUTCFullYear(), quarterMonth + 3, 1) - TANZANIA_OFFSET_MS),
    };
  }
  if (period === "year") {
    const shifted = new Date(now.getTime() + TANZANIA_OFFSET_MS);
    return {
      from: new Date(Date.UTC(shifted.getUTCFullYear(), 0, 1) - TANZANIA_OFFSET_MS),
      to: new Date(Date.UTC(shifted.getUTCFullYear() + 1, 0, 1) - TANZANIA_OFFSET_MS),
    };
  }
  const from = startOfTanzaniaDate(fromInput);
  const to = endOfTanzaniaDate(toInput);
  if (!from || !to || from >= to) return null;
  return { from, to };
}

const overview = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { period = "today" } = req.query;
  const from = startOf(period);
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

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dailySales = await prisma.$queryRawUnsafe(
    `SELECT to_char("createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam', 'YYYY-MM-DD') AS date,
            COALESCE(SUM("totalAmount"), 0)::bigint AS sales,
            COALESCE(SUM(profit), 0)::bigint AS profit
     FROM sales
     WHERE "shopId" = $1 AND status = 'COMPLETED' AND "createdAt" >= $2
     GROUP BY 1`,
    shopId,
    sevenDaysAgo,
  );

  const dailyMap = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = tanzaniaDateKey(d);
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
        `SELECT to_char(date_trunc('month', "createdAt" AT TIME ZONE 'Africa/Dar_es_Salaam'), 'YYYY-MM') AS period,
                COALESCE(SUM("totalAmount"), 0)::bigint AS sales,
                COALESCE(SUM(profit), 0)::bigint AS profit,
                COUNT(*)::int AS "salesCount"
         FROM sales WHERE "shopId" = $1 AND status = 'COMPLETED'
         GROUP BY 1 ORDER BY 1 ASC`,
        shopId,
      ),
      prisma.expense.aggregate({ where: { shopId, category: { not: "STOCK" } }, _sum: { amount: true }, _count: { id: true } }),
    ]);
    return { allTimeRows, historyRows, allExpenseAgg };
  });
  const totalExpenses = expenseAgg._sum.amount || 0;
  const grossProfit = salesAgg._sum.profit || 0;
  const allTime = allTimeRows[0] || {};
  const allTimeSales = Number(allTime.totalSales || 0);
  const allTimeProfit = Number(allTime.totalProfit || 0);
  const allTimeSalesCount = Number(allTime.salesCount || 0);
  const allTimeExpenses = allExpenseAgg._sum.amount || 0;

  res.json({
    period,
    features: featureSnapshot(shopPlan),
    summary: {
      totalSales: salesAgg._sum.totalAmount || 0,
      totalProfit: grossProfit,
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
  if (!["today", "month", "quarter", "year", "custom"].includes(period)) {
    return res.status(400).json({ error: "period must be today, month, quarter, year, or custom" });
  }
  if (period === "custom" && (!req.query.from || !req.query.to)) {
    return res.status(400).json({ error: "from and to are required for a custom date range" });
  }
  const range = profitRange(period, req.query.from, req.query.to);
  if (!range) return res.status(400).json({ error: "Enter a valid date range" });

  const days = Math.ceil((range.to.getTime() - range.from.getTime()) / 86400000);
  const group = period === "today" ? "hour" : (period === "year" || days > 92 ? "month" : "day");
  const bucket = group === "hour"
    ? "date_trunc('hour', s.\"createdAt\" AT TIME ZONE 'Africa/Dar_es_Salaam')"
    : group === "month"
      ? "date_trunc('month', s.\"createdAt\" AT TIME ZONE 'Africa/Dar_es_Salaam')"
      : "date_trunc('day', s.\"createdAt\" AT TIME ZONE 'Africa/Dar_es_Salaam')";
  const label = group === "hour" ? "HH24:00" : group === "month" ? "Mon YYYY" : "YYYY-MM-DD";

  const [totalsRows, chartRows] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT COALESCE(SUM(si.\"totalPrice\"), 0)::bigint AS \"salesRevenue\",
              COALESCE(SUM(si.\"buyingPrice\" * si.quantity), 0)::bigint AS \"costOfGoodsSold\",
              COUNT(DISTINCT s.id)::int AS \"salesCount\",
              COALESCE(SUM(si.quantity), 0)::bigint AS \"unitsSold\"
       FROM sales s
       JOIN sale_items si ON si.\"saleId\" = s.id
       WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND s.\"createdAt\" >= $2 AND s.\"createdAt\" < $3`,
      shopId, range.from, range.to,
    ),
    prisma.$queryRawUnsafe(
      `SELECT to_char(${bucket}, '${label}') AS label,
              COALESCE(SUM(si.\"totalPrice\"), 0)::bigint AS revenue,
              COALESCE(SUM(si.\"buyingPrice\" * si.quantity), 0)::bigint AS cogs,
              COALESCE(SUM(si.\"totalPrice\" - (si.\"buyingPrice\" * si.quantity)), 0)::bigint AS profit
       FROM sales s
       JOIN sale_items si ON si.\"saleId\" = s.id
       WHERE s.\"shopId\" = $1 AND s.status = 'COMPLETED' AND s.\"createdAt\" >= $2 AND s.\"createdAt\" < $3
       GROUP BY ${bucket}
       ORDER BY ${bucket} ASC`,
      shopId, range.from, range.to,
    ),
  ]);

  const totals = totalsRows[0] || {};
  const revenue = Number(totals.salesRevenue || 0);
  const costOfGoodsSold = Number(totals.costOfGoodsSold || 0);
  res.json({
    period,
    from: range.from,
    to: range.to,
    group,
    summary: {
      salesRevenue: revenue,
      costOfGoodsSold,
      grossProfit: revenue - costOfGoodsSold,
      grossProfitMargin: revenue > 0 ? Number((((revenue - costOfGoodsSold) / revenue) * 100).toFixed(1)) : 0,
      salesCount: Number(totals.salesCount || 0),
      unitsSold: Number(totals.unitsSold || 0),
      missingCostSalesRevenue: 0,
    },
    chart: chartRows.map((row) => ({
      label: row.label,
      revenue: Number(row.revenue || 0),
      costOfGoodsSold: Number(row.cogs || 0),
      grossProfit: Number(row.profit || 0),
    })),
  });
});

module.exports = { overview, profitAnalytics };
