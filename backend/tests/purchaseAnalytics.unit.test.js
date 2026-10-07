const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/purchaseAnalytics.controller.js");

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

test("purchase ranges use Tanzania calendar boundaries and reject invalid dates", () => {
  const controller = require(controllerPath);
  const now = new Date("2026-10-06T00:30:00.000Z");

  assert.equal(controller.dateRange("today", null, null, now).from.toISOString(), "2026-10-05T21:00:00.000Z");
  assert.equal(controller.dateRange("week", null, null, now).from.toISOString(), "2026-10-04T21:00:00.000Z");
  assert.equal(controller.dateRange("quarter", null, null, now).from.toISOString(), "2026-09-30T21:00:00.000Z");
  assert.equal(controller.dateRange("all", null, null, now).to.toISOString(), "2026-10-06T00:30:00.001Z");
  assert.equal(controller.dateRange("custom", "2026-02-30", "2026-03-01", now), null);
  assert.equal(controller.dateRange("custom", "2020-01-01", "2030-01-02", now), null);
});

test("purchase report is shop-scoped and includes supplierless receipts in totals and filters", async () => {
  const rawCalls = [];
  require.cache[prismaPath] = {
    id: prismaPath, filename: prismaPath, loaded: true,
    exports: {
      $queryRawUnsafe: async (query, ...params) => {
        rawCalls.push({ query, params });
        if (query.includes('AS "estimatedReceiptCount"')) return [{ receiptCount: 2, productCost: 60000n, transportCost: 3000n, otherCost: 1000n, landedCost: 64000n, estimatedReceiptCount: 1 }];
        if (query.includes('GROUP BY sr."paymentMethod"')) return [{ paymentMethod: "CASH", receiptCount: 2, amount: 64000n }];
        if (query.includes("LIMIT 500")) return [{ id: "__unassigned__", name: "No supplier", receiptCount: 1 }];
        if (query.includes("GROUP BY sr.\"supplierId\"")) return [{ id: "__unassigned__", name: "No supplier", receiptCount: 1, amount: 14000n }];
        if (query.includes("GROUP BY p.id")) return [{ id: "item-1", name: "Feed", unit: "kg", quantity: 1.5, productCost: 60000n, allocatedAdditionalCost: 4000n, landedCost: 64000n }];
        return [];
      },
      stockReceipt: {
        count: async () => 2,
        findMany: async () => [{ id: "receipt-1", receivedAt: new Date("2026-10-05T21:00:00.000Z"), totalLandedCost: 64000, supplier: null, items: [] }],
      },
    },
  };
  delete require.cache[controllerPath];
  const controller = require(controllerPath);
  const res = response();

  await controller.report({
    user: { resolvedShopId: "shop-a" },
    query: { period: "custom", from: "2026-10-01", to: "2026-10-06", supplierId: "__unassigned__", paymentMethod: "CASH", search: "feed", page: "1", pageSize: "25" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.summary.landedCost, 64000);
  assert.equal(res.payload.summary.estimatedReceiptCount, 1);
  assert.equal(res.payload.suppliers[0].id, "__unassigned__");
  assert.equal(res.payload.receipts[0].supplier, null);
  assert.equal(res.payload.products[0].quantity, 1.5);
  assert.equal(rawCalls.length, 5);
  const filteredQuery = rawCalls[0];
  assert.match(filteredQuery.query, /sr\."shopId" = \$1/);
  assert.match(filteredQuery.query, /sr\."supplierId" IS NULL/);
  assert.match(filteredQuery.query, /"paymentMethod" = \$4::"PaymentMethod"/);
  assert.match(filteredQuery.query, /ILIKE \$5/);
  assert.match(rawCalls.find(({ query }) => query.includes("GROUP BY p.id")).query, /SUM\(sri\.quantity\), 0\)::double precision AS quantity/);
  assert.deepEqual(filteredQuery.params.slice(0, 2), ["shop-a", new Date("2026-09-30T21:00:00.000Z")]);
  assert.ok(filteredQuery.params.every((value) => typeof value !== "string" || !filteredQuery.query.includes(value)));
});
