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

test("purchase report applies receipt-payment corrections to filters, totals, history, and pagination", async () => {
  const rawCalls = [];
  let receiptQuery;
  const receipt = {
    id: "receipt-1",
    receivedAt: new Date("2026-10-05T21:00:00.000Z"),
    totalLandedCost: 64000,
    paidAtReceipt: 10000,
    paymentMethod: "CASH",
    supplier: null,
    items: [],
    paymentCorrections: [
      { id: "correction-1", previousCorrectionId: null, correctedAmount: 12000, correctedMethod: "CASH" },
      { id: "correction-2", previousCorrectionId: "correction-1", correctedAmount: 18000, correctedMethod: "MPESA" },
    ],
  };
  require.cache[prismaPath] = {
    id: prismaPath, filename: prismaPath, loaded: true,
    exports: {
      $queryRawUnsafe: async (query, ...params) => {
        rawCalls.push({ query, params });
        if (query.includes('AS "estimatedReceiptCount"')) return [{ receiptCount: 1, productCost: 60000n, transportCost: 3000n, otherCost: 1000n, landedCost: 64000n, paidAtReceipt: 18000n, estimatedReceiptCount: 1 }];
        if (query.includes('AS "paymentMethod"')) return [{ paymentMethod: "MPESA", receiptCount: 1, paidAtReceipt: 18000n }];
        if (query.includes("LIMIT 500")) return [{ id: "__unassigned__", name: "No supplier", receiptCount: 1 }];
        if (query.includes('GROUP BY sr."supplierId"')) return [{ id: "__unassigned__", name: "No supplier", receiptCount: 1, amount: 64000n }];
        if (query.includes("GROUP BY p.id")) return [{ id: "item-1", name: "Feed", unit: "kg", quantity: 1.5, productCost: 60000n, allocatedAdditionalCost: 4000n, landedCost: 64000n }];
        if (query.includes("AS total")) return [{ total: 1 }];
        if (query.includes("SELECT sr.id")) return [{ id: "receipt-1" }];
        return [];
      },
      stockReceipt: { findMany: async (args) => { receiptQuery = args; return [receipt]; } },
    },
  };
  delete require.cache[controllerPath];
  const controller = require(controllerPath);
  const res = response();

  await controller.report({
    user: { resolvedShopId: "shop-a" },
    query: { period: "custom", from: "2026-10-01", to: "2026-10-06", supplierId: "__unassigned__", paymentMethod: "MPESA", search: "feed", page: "1", pageSize: "25" },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.summary.landedCost, 64000);
  assert.equal(res.payload.summary.paidAtReceipt, 18000);
  assert.deepEqual(res.payload.paymentBreakdown[0], { paymentMethod: "MPESA", receiptCount: 1, paidAtReceipt: 18000 });
  assert.equal(res.payload.summary.estimatedReceiptCount, 1);
  assert.equal(res.payload.suppliers[0].id, "__unassigned__");
  assert.equal(res.payload.receipts[0].supplier, null);
  assert.equal(res.payload.receipts[0].paidAtReceipt, 18000);
  assert.equal(res.payload.receipts[0].paymentMethod, "MPESA");
  assert.deepEqual(receiptQuery.include.paymentCorrections.select, {
    id: true, previousCorrectionId: true, previousAmount: true, correctedAmount: true,
    previousMethod: true, correctedMethod: true, note: true, createdAt: true,
  });
  assert.equal(res.payload.pagination.total, 1);
  assert.equal(res.payload.products[0].quantity, 1.5);
  assert.equal(rawCalls.length, 7);

  const filteredQuery = rawCalls[0];
  assert.match(filteredQuery.query, /sr\."shopId" = \$1/);
  assert.match(filteredQuery.query, /sr\."supplierId" IS NULL/);
  assert.match(filteredQuery.query, /COALESCE\(\(SELECT c\."correctedMethod"/);
  assert.match(filteredQuery.query, /\) = \$4::"PaymentMethod"/);
  assert.match(rawCalls.find(({ query }) => query.includes('AS "paymentMethod"')).query, /stock_receipt_payment_corrections/);
  assert.match(rawCalls.find(({ query }) => query.includes('AS "paymentMethod"')).query, /SUM\(COALESCE/);
  assert.match(filteredQuery.query, /ILIKE \$5/);
  assert.match(rawCalls.find(({ query }) => query.includes("GROUP BY p.id")).query, /SUM\(sri\.quantity\), 0\)::double precision AS quantity/);
  assert.deepEqual(filteredQuery.params.slice(0, 2), ["shop-a", new Date("2026-09-30T21:00:00.000Z")]);
  assert.ok(filteredQuery.params.every((value) => typeof value !== "string" || !filteredQuery.query.includes(value)));
  const pageQuery = rawCalls.find(({ query }) => query.includes("SELECT sr.id"));
  assert.match(pageQuery.query, /LIMIT \$6 OFFSET \$7/);
  assert.deepEqual(pageQuery.params.slice(-2), [25, 0]);
});
