const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { startOfTanzaniaDay, startOfTanzaniaMonth, tanzaniaDateKey } = require("../lib/businessTime");
const { featureSnapshot } = require("../lib/entitlements");

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

const overview = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { period = "today" } = req.query;
  const from = startOf(period);
  const salesWhere = from ? { shopId, createdAt: { gte: from } } : { shopId };
  const activeProductsWhere = { shopId, isActive: true };

  const [shopPlan, salesAgg, expenseAgg, salesCount, totalProducts, lowStockCandidates, lowStockCount, outOfStockCount, pendingOrders, recentSales] = await Promise.all([
    prisma.shop.findUnique({ where: { id: shopId }, select: { plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true } }),
    prisma.sale.aggregate({
      where: salesWhere,
      _sum: { totalAmount: true, profit: true },
    }),
    prisma.expense.aggregate({
      where: salesWhere.createdAt ? { shopId, spentAt: salesWhere.createdAt } : { shopId },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.sale.count({ where: salesWhere }),
    prisma.product.count({ where: activeProductsWhere }),
    prisma.product.findMany({
      where: activeProductsWhere,
      select: { id: true, name: true, currentStock: true, minimumStock: true, unit: true },
      orderBy: [{ currentStock: "asc" }, { name: "asc" }],
    }),
    prisma.product.count({
      where: {
        ...activeProductsWhere,
        currentStock: { gt: 0, lte: 5 },
      },
    }),
    prisma.product.count({ where: { ...activeProductsWhere, currentStock: 0 } }),
    prisma.order.count({ where: { shopId, status: { in: ["PENDING", "CONFIRMED", "OUT_FOR_DELIVERY"] } } }),
    prisma.sale.findMany({
      where: salesWhere,
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, totalAmount: true, profit: true, paymentMethod: true, createdAt: true },
    }),
  ]);

  const lowStockProducts = lowStockCandidates.filter((p) => p.currentStock <= p.minimumStock);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dailySales = await prisma.sale.findMany({
    where: { shopId, createdAt: { gte: sevenDaysAgo } },
    select: { totalAmount: true, profit: true, createdAt: true },
  });

  const dailyMap = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = tanzaniaDateKey(d);
    dailyMap[key] = { date: key, sales: 0, profit: 0 };
  }
  for (const s of dailySales) {
    const key = tanzaniaDateKey(s.createdAt);
    if (dailyMap[key]) {
      dailyMap[key].sales += s.totalAmount;
      dailyMap[key].profit += s.profit;
    }
  }

  const topProducts = await prisma.saleItem.groupBy({
    by: ["productId"],
    where: from ? { sale: { shopId, createdAt: { gte: from } } } : { sale: { shopId } },
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

  const [historySales, allExpenseAgg] = await Promise.all([
    prisma.sale.findMany({
      where: { shopId },
      select: { totalAmount: true, profit: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.expense.aggregate({ where: { shopId }, _sum: { amount: true }, _count: { id: true } }),
  ]);
  const totalExpenses = expenseAgg._sum.amount || 0;
  const grossProfit = salesAgg._sum.profit || 0;
  const allTimeProfit = historySales.reduce((sum, sale) => sum + sale.profit, 0);
  const allTimeExpenses = allExpenseAgg._sum.amount || 0;

  const historyMap = {};
  for (const sale of historySales) {
    const date = new Date(sale.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!historyMap[key]) {
      historyMap[key] = { period: key, sales: 0, profit: 0, salesCount: 0 };
    }
    historyMap[key].sales += sale.totalAmount;
    historyMap[key].profit += sale.profit;
    historyMap[key].salesCount += 1;
  }

  const firstSaleAt = historySales[0]?.createdAt || null;

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
      lowStockCount: Math.max(lowStockCount, lowStockProducts.length),
      outOfStockCount,
    },
    allTimeSummary: {
      totalSales: historySales.reduce((sum, sale) => sum + sale.totalAmount, 0),
      totalProfit: allTimeProfit,
      totalExpenses: allTimeExpenses,
      netProfit: allTimeProfit - allTimeExpenses,
      expenseCount: allExpenseAgg._count.id,
      salesCount: historySales.length,
      firstSaleAt,
    },
    lowStockAlerts: lowStockProducts.map((p) => ({
      id: p.id,
      name: p.name,
      currentStock: p.currentStock,
      minimumStock: p.minimumStock,
      unit: p.unit,
    })),
    recentSales,
    dailyChart: Object.values(dailyMap),
    paymentBreakdown: paymentBreakdownRaw.map((item) => ({
      paymentMethod: item.paymentMethod,
      totalAmount: item._sum.totalAmount || 0,
      salesCount: item._count.id,
    })),
    historyTimeline: Object.values(historyMap),
    topProducts: topProducts.map((t) => ({
      product: topProductMap[t.productId],
      totalQuantity: t._sum.quantity,
      totalRevenue: t._sum.totalPrice,
    })),
  });
});

module.exports = { overview };
