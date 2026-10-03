const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { lastSevenTanzaniaDays, tanzaniaDateKey } = require("../src/lib/businessTime");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/dashboard.controller.js");

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

test("profit analytics uses historical sale-item costs and shop-scoped totals", async () => {
  const calls = [];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      shop: { findUnique: async () => ({ id: "shop-1" }) },
      debtPayment: { aggregate: async () => ({ _sum: { amount: 10000 } }) },
      farmProductionBatch: { aggregate: async () => ({ _sum: { actualYield: 75, brokenQuantity: 8, wasteQuantity: 10, ingredientCost: 40000, additionalCost: 10000, totalCost: 50000 }, _count: { id: 2 } }) },
      farmProductionItem: { groupBy: async () => [{ productId: "feed-1", _sum: { quantity: 25, totalCost: 40000 } }] },
      product: { findMany: async () => [{ id: "feed-1", name: "Layer feed", unit: "kg" }] },
      $queryRawUnsafe: async (query, ...params) => {
        calls.push({ query, params });
        if (query.includes("knownCostGrossProfit") && query.includes(" AS expenses")) {
          return calls.length === 1
            ? [{ salesRevenue: 320000n, cashCollected: 280000n, creditSales: 40000n, costOfGoodsSold: 235000n, knownCostRevenue: 320000n, knownCostGrossProfit: 85000n, missingCostSalesRevenue: 0n, salesCount: 14, unitsSold: 53n, expenses: 12000n }]
            : [{ salesRevenue: 300000n, cashCollected: 260000n, creditSales: 40000n, costOfGoodsSold: 220000n, knownCostRevenue: 300000n, knownCostGrossProfit: 80000n, missingCostSalesRevenue: 0n, salesCount: 12, unitsSold: 49n, expenses: 10000n }];
        }
        if (query.includes("WITH sales_by_bucket")) return [{ label: "10:00", sortKey: "2026-10-03 10:00", revenue: 320000n, salesCount: 14, unitsSold: 53n }];
        if (query.includes('AS "knownRevenue"') && query.includes("JOIN sale_items si")) return [{ label: "10:00", sortKey: "2026-10-03 10:00", revenue: 320000n, cogs: 235000n, knownRevenue: 320000n, profit: 85000n }];
        if (query.includes("FROM sale_returns sr JOIN sale_return_items") || query.includes("FROM sale_return_items sri JOIN sale_returns")) return [];
        if (query.includes("FROM expenses e") && query.includes("AS expenses")) return [{ label: "10:00", sortKey: "2026-10-03 10:00", expenses: 12000n }];
        if (query.includes("AS label") && query.includes("GROUP BY")) return [{ label: "10:00", revenue: 320000n, cogs: 235000n, profit: 85000n }];
        if (query.includes("FROM products p")) return [];
        if (query.includes("GROUP BY p.id")) return [{ id: "product-1", name: "Unga", unit: "kg", currentStock: 7, quantity: 53, revenue: 320000n, knownCostGrossProfit: 85000n, missingCostSalesRevenue: 0n, lastSoldAt: new Date() }];
        if (query.includes("collections GROUP BY method")) return [{ paymentMethod: "CASH", amount: 80000n }];
        if (query.includes('GROUP BY s."paymentMethod" ORDER BY amount DESC')) return [{ paymentMethod: "CASH", salesCount: 10, amount: 80000n }];
        if (query.includes("FROM stock_receipts sr JOIN suppliers")) return [{ id: "supplier-1", name: "Mkulima Supplies", receiptCount: 2, amount: 64000n }];
        if (query.includes("LEFT JOIN (SELECT \"saleId\"")) return [{ name: "Asha", phoneLast4: "1234", salesCount: 3, amount: 45000n }];
        if (query.includes('LEFT JOIN staff_members st')) return [{ id: "staff-1", name: "Neema", salesCount: 8, amount: 210000n, unitsSold: 31n }];
        return [{ overdue: 5000n, dueSoon: 3000n, noDueDate: 2000n, outstanding: 10000n }];
      },
    },
  };
  delete require.cache[shopAccessPath];
  delete require.cache[controllerPath];
  const controller = require(controllerPath);
  const res = response();

  await controller.profitAnalytics({ user: { userId: "owner-1" }, query: { period: "today" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.summary.salesRevenue, 320000);
  assert.equal(res.payload.summary.costOfGoodsSold, 235000);
  assert.equal(res.payload.summary.grossProfit, 85000);
  assert.equal(res.payload.summary.grossProfitMargin, 26.6);
  assert.equal(res.payload.summary.salesCount, 14);
  assert.equal(res.payload.summary.cashCollected, 280000);
  assert.equal(res.payload.summary.creditSales, 40000);
  assert.equal(res.payload.summary.expenses, 12000);
  assert.equal(res.payload.summary.netProfit, 73000);
  assert.equal(res.payload.summary.costComplete, true);
  assert.equal(res.payload.comparison.salesRevenue.change, 20000);
  assert.equal(res.payload.debtAging.overdue, 5000);
  assert.equal(res.payload.collectionBreakdown[0].paymentMethod, "CASH");
  assert.equal(res.payload.salesPaymentBreakdown[0].salesCount, 10);
  assert.equal(res.payload.topSuppliers[0].name, "Mkulima Supplies");
  assert.equal(res.payload.topCustomers[0].phoneLast4, "1234");
  assert.equal(res.payload.salesByStaff[0].name, "Neema");
  assert.equal(res.payload.products[0].name, "Unga");
  assert.equal(res.payload.production.batchCount, 2);
  assert.equal(res.payload.production.usableOutput, 67);
  assert.equal(res.payload.production.brokenEggs, 8);
  assert.equal(res.payload.production.totalCost, 50000);
  assert.deepEqual(res.payload.production.inputs[0], { productId: "feed-1", name: "Layer feed", unit: "kg", quantity: 25, cost: 40000 });
  assert.equal(calls.some(({ query }) => query.includes('AS "knownRevenue"') && query.includes("JOIN sale_items si")), true);
  assert.equal(res.payload.chart[0].grossProfit, 85000);
  assert.equal(res.payload.chart[0].expenses, 12000);
  assert.equal(res.payload.chart[0].netProfit, 73000);
  assert.equal(res.payload.chart[0].salesCount, 14);
  assert.equal(res.payload.chart[0].unitsSold, 53);
  assert.equal(res.payload.chart[0].grossProfitMargin, 26.6);
  assert.equal(calls[0].params[0], "shop-1");
  assert.match(calls[0].query, /sale_items/);
  const productRankingQuery = calls.find(({ query }) => query.includes("linked_product_sales") && query.includes("unlinked_item_sales"))?.query;
  assert.ok(productRankingQuery);
  assert.match(productRankingQuery, /GROUP BY p\.id, p\.name, p\.unit, p\."currentStock"/);
  assert.match(productRankingQuery, /GROUP BY COALESCE\(si\.name, si\.description, 'Item'\), COALESCE\(si\.unit, ''\)/);
  assert.match(productRankingQuery, /JOIN products p ON p\.id = si\."productId" AND p\."shopId" = s\."shopId"/);
});

test("profit analytics flags revenue with missing cost and excludes it from margin denominator", async () => {
  require.cache[prismaPath] = {
    id: prismaPath, filename: prismaPath, loaded: true,
    exports: {
      shop: { findUnique: async () => ({ id: "shop-1" }) },
      debtPayment: { aggregate: async () => ({ _sum: { amount: 0 } }) },
      farmProductionBatch: { aggregate: async () => ({ _sum: {}, _count: { id: 0 } }) },
      farmProductionItem: { groupBy: async () => [] },
      product: { findMany: async () => [] },
      $queryRawUnsafe: async (query) => {
        if (query.includes("knownCostGrossProfit") && query.includes(" AS expenses")) return [{ salesRevenue: 1500, cashCollected: 1500, creditSales: 0, costOfGoodsSold: 500, knownCostRevenue: 1000, knownCostGrossProfit: 500, missingCostSalesRevenue: 500, salesCount: 2, unitsSold: 3, expenses: 100 }];
        if (query.includes("FROM sale_returns sr JOIN sale_return_items") || query.includes("FROM sale_return_items sri JOIN sale_returns")) return [];
        if (query.includes("FROM expenses e") && query.includes("AS expenses")) return [];
        if (query.includes("AS label") && query.includes("GROUP BY")) return [];
        if (query.includes("FROM products p")) return [];
        if (query.includes("GROUP BY p.id")) return [];
        return [{ overdue: 0, dueSoon: 0, noDueDate: 0, outstanding: 0 }];
      },
    },
  };
  delete require.cache[shopAccessPath];
  delete require.cache[controllerPath];
  const controller = require(controllerPath);
  const res = response();
  await controller.profitAnalytics({ user: { userId: "owner-1" }, query: { period: "today" } }, res);
  assert.equal(res.payload.summary.grossProfit, 500);
  assert.equal(res.payload.summary.missingCostSalesRevenue, 500);
  assert.equal(res.payload.summary.costComplete, false);
  assert.equal(res.payload.summary.grossProfitMargin, 50);
});

test("dashboard week starts Monday in Tanzania while its chart spans seven complete local dates", () => {
  const controller = require(controllerPath);
  const friday = new Date("2026-10-02T10:00:00.000Z");
  const sundayBeforeMidnight = new Date("2026-10-04T20:59:59.000Z");
  const mondayAfterMidnight = new Date("2026-10-04T21:00:01.000Z");

  assert.equal(controller.startOf("week", friday).toISOString(), "2026-09-27T21:00:00.000Z");
  assert.equal(controller.startOf("week", sundayBeforeMidnight).toISOString(), "2026-09-27T21:00:00.000Z");
  assert.equal(controller.startOf("week", mondayAfterMidnight).toISOString(), "2026-10-04T21:00:00.000Z");
  assert.deepEqual(lastSevenTanzaniaDays(friday).map(tanzaniaDateKey), [
    "2026-09-26",
    "2026-09-27",
    "2026-09-28",
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
    "2026-10-02",
  ]);
});
