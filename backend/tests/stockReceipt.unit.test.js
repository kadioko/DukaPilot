const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const cashSessionPath = path.resolve(__dirname, "../src/lib/cashSession.js");
const supplierAccessPath = path.resolve(__dirname, "../src/lib/supplierAccess.js");
const cachePath = path.resolve(__dirname, "../src/services/dashboard-cache.service.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/stockReceipt.controller.js");

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(body) { this.payload = body; return this; } };
}

function loadController(prismaMock) {
  delete require.cache[controllerPath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
  require.cache[shopAccessPath] = { id: shopAccessPath, filename: shopAccessPath, loaded: true, exports: { getShopIdForUser: async () => "shop-1" } };
  require.cache[cashSessionPath] = { id: cashSessionPath, filename: cashSessionPath, loaded: true, exports: { findOpenCashSession: async () => null } };
  require.cache[supplierAccessPath] = { id: supplierAccessPath, filename: supplierAccessPath, loaded: true, exports: { findVisibleSupplier: async () => null } };
  require.cache[cachePath] = { id: cachePath, filename: cachePath, loaded: true, exports: { invalidateDashboardHistory: async () => {} } };
  return require(controllerPath);
}

test("zero-cost goods allocate transport by quantity without losing whole TZS", () => {
  const { distributeLandedCost } = loadController({});
  const items = distributeLandedCost([
    { productId: "free-a", quantity: 10, unitCost: 0 },
    { productId: "free-b", quantity: 5, unitCost: 0 },
  ], 101, 0);

  assert.deepEqual(items.map((item) => item.allocatedAdditionalCost), [67, 34]);
  assert.equal(items.reduce((total, item) => total + item.landedTotalCost, 0), 101);
});

test("a retry from an older app version reuses its receipt instead of receiving stock twice", async () => {
  const requestKey = crypto.randomUUID();
  const receivedAt = "2026-10-16T10:00:00.000Z";
  const body = {
    requestKey,
    allocationMode: "DIRECT",
    supplierId: "supplier-1",
    sourceOrderId: null,
    invoiceNumber: null,
    note: null,
    transportCost: 0,
    otherCost: 0,
    paymentMethod: "CASH",
    receivedAt,
    items: [{ productId: "product-1", quantity: 2, unitCost: 1000 }],
  };
  const oldHash = crypto.createHash("sha256").update(JSON.stringify({
    allocationMode: "DIRECT",
    totalGroceryBill: null,
    supplierId: "supplier-1",
    sourceOrderId: null,
    invoiceNumber: null,
    note: null,
    transportCost: 0,
    otherCost: 0,
    paymentMethod: "CASH",
    receivedAt,
    items: body.items,
  })).digest("hex");
  const replay = { id: "receipt-existing", requestKey, requestHash: oldHash, items: [] };
  let transactionCalls = 0;
  let writes = 0;
  const tx = { stockReceipt: { findFirst: async () => replay } };
  const prismaMock = {
    $transaction: async (callback) => { transactionCalls += 1; return callback(tx); },
    stockReceipt: { findFirst: async () => replay },
    product: { update: async () => { writes += 1; } },
  };
  const controller = loadController(prismaMock);
  const res = response();

  await controller.receive({ user: { userId: "owner-1" }, body }, res);

  assert.equal(transactionCalls, 1);
  assert.equal(writes, 0);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.receipt.id, "receipt-existing");
  assert.equal(res.payload.reused, true);
});
