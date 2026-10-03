const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/productPerformance.controller.js");

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

function controller(prismaMock) {
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
  require.cache[shopAccessPath] = { id: shopAccessPath, filename: shopAccessPath, loaded: true, exports: { getShopIdForUser: async () => "shop-a" } };
  delete require.cache[controllerPath];
  return require(controllerPath);
}

test("product performance lists shop products with completed-sale cost coverage and bounded pagination", async () => {
  const calls = [];
  const row = {
    id: "product-a", name: "Egg tray", sku: "EGG-30", unit: "tray", isActive: true, isInternalUse: false,
    currentStock: 12, minimumStock: 3, buyingPrice: 7000, sellingPrice: 10000, wholesalePrice: 9000,
    saleCount: 3, unitsSold: 5n, revenue: 50000n, knownCostOfGoodsSold: 28000n,
    knownCostRevenue: 40000n, grossProfit: 12000n, missingCostSalesRevenue: 10000n,
    retailUnits: 3n, wholesaleUnits: 2n, lastSoldAt: new Date(), grossMargin: 30,
  };
  const handler = controller({
    product: { count: async ({ where }) => { calls.push({ type: "count", where }); return 1; } },
    $queryRawUnsafe: async (sql, ...params) => { calls.push({ type: "sql", sql, params }); return sql.includes("FROM sale_return_items") ? [] : [row]; },
  });
  const res = response();
  await handler.list({ user: { userId: "owner-a" }, query: { period: "custom", from: "2026-09-01", to: "2026-09-30", search: "egg", sort: "profit", status: "active", page: "2", limit: "10" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.total, 1);
  assert.equal(res.payload.products[0].revenue, 50000);
  assert.equal(res.payload.products[0].costCoveragePercent, 80);
  assert.equal(res.payload.products[0].averageSalePrice, 10000);
  assert.equal(res.payload.products[0].grossProfit, 12000);
  assert.deepEqual(calls.find((call) => call.type === "count").where, {
    shopId: "shop-a", isActive: true,
    OR: [{ name: { contains: "egg", mode: "insensitive" } }, { sku: { contains: "egg", mode: "insensitive" } }],
  });
  const sqlCall = calls.find((call) => call.type === "sql");
  assert.equal(sqlCall.params[0], "shop-a");
  assert.equal(sqlCall.params[3], "egg");
  assert.equal(sqlCall.params[6], 10);
  assert.match(sqlCall.sql, /s\.status = 'COMPLETED'/);
  assert.match(sqlCall.sql, /s\."shopId" = \$1/);
  assert.match(sqlCall.sql, /p\."shopId" = \$1/);
  assert.match(sqlCall.sql, /si\."buyingPrice" > 0/);
  assert.match(sqlCall.sql, /ORDER BY "grossProfit" DESC/);
});

test("product performance rejects invalid report filters before querying data", async () => {
  let queried = false;
  const handler = controller({ $queryRawUnsafe: async () => { queried = true; return []; } });
  const res = response();
  await handler.list({ user: { userId: "owner-a" }, query: { period: "month", sort: "revenue; DROP TABLE sales" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
});

test("product detail is shop scoped and excludes customer information", async () => {
  const calls = [];
  const handler = controller({
    $queryRawUnsafe: async (sql, ...params) => { calls.push({ sql, params }); return []; },
    saleReturnItem: { findMany: async () => [] },
    saleItem: { findMany: async ({ where, select, take }) => {
      assert.equal(where.sale.shopId, "shop-a");
      assert.equal(where.sale.status, "COMPLETED");
      assert.equal(where.productId, "product-other-shop");
      assert.equal(take, 10);
      assert.equal(select.sale.select.customerPhone, undefined);
      return [];
    } },
  });
  const res = response();
  await handler.detail({ user: { userId: "owner-a" }, params: { id: "product-other-shop" }, query: { period: "week" } }, res);
  assert.equal(res.statusCode, 404);
  assert.ok(calls.every((call) => call.params[0] === "shop-a"));
});
