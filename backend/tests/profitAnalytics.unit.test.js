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
      $queryRawUnsafe: async (query, ...params) => {
        calls.push({ query, params });
        if (query.includes("knownCostGrossProfit") && query.includes(" AS expenses")) {
          return calls.length === 1
            ? [{ salesRevenue: 320000n, cashCollected: 280000n, creditSales: 40000n, costOfGoodsSold: 235000n, knownCostRevenue: 320000n, knownCostGrossProfit: 85000n, missingCostSalesRevenue: 0n, salesCount: 14, unitsSold: 53n, expenses: 12000n }]
            : [{ salesRevenue: 300000n, cashCollected: 260000n, creditSales: 40000n, costOfGoodsSold: 220000n, knownCostRevenue: 300000n, knownCostGrossProfit: 80000n, missingCostSalesRevenue: 0n, salesCount: 12, unitsSold: 49n, expenses: 10000n }];
        }
        if (query.includes("FROM expenses e") && query.includes("AS expenses")) return [{ label: "10:00", expenses: 12000n }];
        if (query.includes("AS label") && query.includes("GROUP BY")) return [{ label: "10:00", revenue: 320000n, cogs: 235000n, profit: 85000n }];
        if (query.includes("FROM products p")) return [];
        if (query.includes("GROUP BY p.id")) return [{ id: "product-1", name: "Unga", unit: "kg", currentStock: 7, quantity: 53, revenue: 320000n, knownCostGrossProfit: 85000n, missingCostSalesRevenue: 0n, lastSoldAt: new Date() }];
        if (query.includes("collections GROUP BY method")) return [{ paymentMethod: "CASH", amount: 80000n }];
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
  assert.equal(res.payload.products[0].name, "Unga");
  assert.equal(res.payload.chart[0].grossProfit, 85000);
  assert.equal(res.payload.chart[0].expenses, 12000);
  assert.equal(res.payload.chart[0].netProfit, 73000);
  assert.equal(calls[0].params[0], "shop-1");
  assert.match(calls[0].query, /sale_items/);
});

test("profit analytics flags revenue with missing cost and excludes it from margin denominator", async () => {
  require.cache[prismaPath] = {
    id: prismaPath, filename: prismaPath, loaded: true,
    exports: {
      shop: { findUnique: async () => ({ id: "shop-1" }) },
      debtPayment: { aggregate: async () => ({ _sum: { amount: 0 } }) },
      $queryRawUnsafe: async (query) => {
        if (query.includes("knownCostGrossProfit") && query.includes(" AS expenses")) return [{ salesRevenue: 1500, cashCollected: 1500, creditSales: 0, costOfGoodsSold: 500, knownCostRevenue: 1000, knownCostGrossProfit: 500, missingCostSalesRevenue: 500, salesCount: 2, unitsSold: 3, expenses: 100 }];
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
