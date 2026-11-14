const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const entitlementsPath = path.resolve(__dirname, "../src/lib/entitlements.js");
const dashboardCachePath = path.resolve(__dirname, "../src/services/dashboard-cache.service.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/dashboard.controller.js");
const { endOfTanzaniaDay } = require("../src/lib/businessTime");

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("dashboard caches historical cost quality and bounds yesterday to the Tanzania business day", async (t) => {
  const modulePaths = [prismaPath, shopAccessPath, entitlementsPath, dashboardCachePath, controllerPath];
  const originalModules = new Map(modulePaths.map((modulePath) => [modulePath, require.cache[modulePath]]));
  let allTimeCostReads = 0;
  const expenseReads = [];
  const salesReads = [];
  const topProductReads = [];
  const financialReads = [];
  const history = new Map();

  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      shop: { findUnique: async () => ({ id: "shop-cache-test", plan: "PRO" }) },
      sale: {
        aggregate: async (args) => { salesReads.push(args); return { _sum: { totalAmount: 0, profit: 0 }, _count: { id: 0 } }; },
        count: async () => 0,
        findMany: async () => [],
        groupBy: async () => [],
      },
      saleItem: { groupBy: async (args) => { topProductReads.push(args); return []; } },
      expense: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
      product: { count: async () => 0, findMany: async () => [] },
      order: { count: async () => 0 },
      $queryRawUnsafe: async (query, ...params) => {
        if (query.includes('AS "knownCostGrossProfit"') || query.includes('FROM quotation_payments qp') || query.includes('AS "grossAmount"')) financialReads.push({ query, params });
        if (query.includes("FROM expenses e")) {
          expenseReads.push({ query, params });
          return [{ amount: 0n, count: 0 }];
        }
        if (query.includes('AS "knownCostGrossProfit"')) {
          if (params[1] === null && params[2] === null) allTimeCostReads += 1;
          return [{ knownCostGrossProfit: 0n, missingCostSalesRevenue: 0n, grossReturnedRevenue: 0n, reversedRevenue: 0n, returnedRevenue: 0n }];
        }
        if (query.includes('AS "totalSales"')) return [{ totalSales: 0n, totalProfit: 0n, salesCount: 0, firstSaleAt: null }];
        return [];
      },
    },
  };
  require.cache[shopAccessPath] = {
    id: shopAccessPath,
    filename: shopAccessPath,
    loaded: true,
    exports: { getShopIdForUser: async () => "shop-cache-test" },
  };
  require.cache[entitlementsPath] = {
    id: entitlementsPath,
    filename: entitlementsPath,
    loaded: true,
    exports: { featureSnapshot: () => ({}) },
  };
  require.cache[dashboardCachePath] = {
    id: dashboardCachePath,
    filename: dashboardCachePath,
    loaded: true,
    exports: {
      dashboardHistory: async (shopId, loader) => {
        if (!history.has(shopId)) history.set(shopId, await loader());
        return history.get(shopId);
      },
    },
  };

  try {
    delete require.cache[controllerPath];
    const controller = require(controllerPath);
    for (let index = 0; index < 2; index += 1) {
      const res = response();
      await controller.overview({ user: { userId: "owner-1" }, query: { period: "today" } }, res);
      assert.equal(res.statusCode, 200);
      assert.equal(res.payload.allTimeSummary.totalProfit, 0);
      assert.equal(res.payload.summary.totalProfit, 0);
    }
    assert.equal(allTimeCostReads, 1);
    assert.equal(expenseReads.length >= 2, true);
    assert.equal(expenseReads.every(({ query }) => query.includes('e."requiresDateReview"') && query.includes("Africa/Dar_es_Salaam") && query.includes("AT TIME ZONE 'UTC'")), true);
    assert.equal(expenseReads[0].params[2].toISOString(), endOfTanzaniaDay().toISOString());
    assert.equal(expenseReads[0].query.includes('e."spentAt" >= $2'), true);
    assert.equal(expenseReads[0].query.includes('e."spentAt" < $3'), true);
    assert.equal(expenseReads[0].params[2].toISOString(), endOfTanzaniaDay().toISOString());

    t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-14T21:30:00Z") });
    salesReads.length = 0;
    topProductReads.length = 0;
    financialReads.length = 0;
    expenseReads.length = 0;
    const res = response();
    await controller.overview({ user: { userId: "owner-1" }, query: { period: "yesterday" } }, res);
    assert.equal(res.payload.period, "yesterday");
    const from = "2026-11-13T21:00:00.000Z";
    const to = "2026-11-14T21:00:00.000Z";
    assert.equal(res.payload.periodBounds.from.toISOString(), from);
    assert.equal(res.payload.periodBounds.to.toISOString(), to);
    assert.equal(res.payload.periodBounds.timeZone, "Africa/Dar_es_Salaam");
    assert.equal(salesReads[0].where.createdAt.gte.toISOString(), from);
    assert.equal(salesReads[0].where.createdAt.lt.toISOString(), to);
    assert.equal(salesReads[1].where.createdAt.gte.toISOString(), "2026-11-12T21:00:00.000Z");
    assert.equal(salesReads[1].where.createdAt.lt.toISOString(), from);
    assert.deepEqual(topProductReads[0].where.sale.createdAt, salesReads[0].where.createdAt);
    assert.equal(expenseReads[0].params[1].toISOString(), from);
    assert.equal(expenseReads[0].params[2].toISOString(), to);
    const currentFinancialReads = financialReads.filter(({ params }) => params[1]?.toISOString() === from);
    assert.equal(currentFinancialReads.length, 3);
    for (const { params } of currentFinancialReads) {
      assert.equal(params[2].toISOString(), to);
    }
  } finally {
    for (const modulePath of modulePaths) {
      const original = originalModules.get(modulePath);
      if (original) require.cache[modulePath] = original;
      else delete require.cache[modulePath];
    }
  }
});
