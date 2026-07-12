const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

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
      $queryRawUnsafe: async (query, ...params) => {
        calls.push({ query, params });
        return calls.length === 1
          ? [{ salesRevenue: 320000n, costOfGoodsSold: 235000n, salesCount: 14, unitsSold: 53n }]
          : [{ label: "10:00", revenue: 320000n, cogs: 235000n, profit: 85000n }];
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
  assert.equal(res.payload.chart[0].grossProfit, 85000);
  assert.equal(calls[0].params[0], "shop-1");
  assert.match(calls[0].query, /sale_items/);
});
