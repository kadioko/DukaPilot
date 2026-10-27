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

test("saved receipts expose net returned quantities while keeping return history separate", async () => {
  const receipt = {
    id: "receipt-1", shopId: "shop-1", requestKey: "private-key", requestHash: "private-hash",
    items: [{ id: "line-1", quantity: 5, product: { name: "Soap", unit: "pcs" } }],
    credits: [
      { reversalOfId: null, items: [{ stockReceiptItemId: "line-1", quantity: 3 }] },
      { reversalOfId: "return-1", items: [{ stockReceiptItemId: "line-1", quantity: -1 }] },
    ],
  };
  const { get } = loadController({ stockReceipt: { findFirst: async ({ where }) => {
    assert.deepEqual(where, { id: "receipt-1", shopId: "shop-1" });
    return receipt;
  } } });
  const res = response();
  await get({ user: { userId: "owner-1" }, params: { id: "receipt-1" } }, res, assert.fail);
  assert.equal(res.payload.receipt.items[0].returnedQuantity, 2);
  assert.equal(res.payload.receipt.hasReturnHistory, true);
  assert.equal(res.payload.receipt.hasReturnReversal, true);
  assert.equal("credits" in res.payload.receipt, false);
  assert.equal("requestKey" in res.payload.receipt, false);
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
  const replay = { id: "receipt-existing", requestKey, requestHash: oldHash, paymentMethod: "CASH", totalLandedCost: 2000, paidAtReceipt: 2000, items: [] };
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

  let changedPaymentError;
  await controller.receive({ user: { userId: "owner-1" }, body: { ...body, paidAtReceipt: 500 } }, response(), (error) => { changedPaymentError = error; });
  assert.equal(changedPaymentError.status, 409);
});

test("an arrived pending supplier order can be received and its status follows the stock receipt", async () => {
  const requestKey = crypto.randomUUID();
  let orderStatus;
  let receiptCreated;
  const tx = {
    $queryRawUnsafe: async () => [],
    stockReceipt: {
      findFirst: async () => null,
      create: async ({ data }) => { receiptCreated = data; return { id: "receipt-1", ...data }; },
      findUnique: async () => ({ id: "receipt-1", supplierId: "supplier-private-1", items: [] }),
    },
    order: {
      findFirst: async () => ({
        id: "order-1",
        supplierId: "supplier-private-1",
        status: "PENDING",
        items: [{ id: "order-item-1", productId: "product-1", quantity: 4, receivedQuantity: 0 }],
      }),
      update: async ({ data }) => { orderStatus = data.status; return { id: "order-1", ...data }; },
    },
    product: {
      findMany: async () => [{ id: "product-1", buyingPrice: 1000 }],
      update: async () => {},
    },
    stockReceiptItem: { create: async () => {} },
    stockMovement: { create: async () => {} },
    orderItem: {
      updateMany: async () => {},
      findMany: async () => [{ quantity: 4, receivedQuantity: 4 }],
    },
  };
  const controller = loadController({ $transaction: async (callback) => callback(tx) });
  const res = response();

  await controller.receive({
    user: { userId: "owner-1" },
    body: {
      requestKey,
      sourceOrderId: "order-1",
      allocationMode: "DIRECT",
      paymentMethod: "CREDIT",
      paidAtReceipt: 0,
      receivedAt: "2026-10-16T10:00:00.000Z",
      items: [{ productId: "product-1", quantity: 4, unitCost: 1000 }],
    },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(receiptCreated.supplierId, "supplier-private-1");
  assert.equal(receiptCreated.sourceOrderId, "order-1");
  assert.equal(orderStatus, "DELIVERED");
});

test("receipt retries without a supplied date keep their fingerprint after the server clock advances", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-17T09:00:00Z") });
  let saved;
  let stockWrites = 0;
  const tx = {
    stockReceipt: {
      findFirst: async () => saved,
      create: async ({ data }) => { saved = { id: "receipt-1", ...data, items: [] }; return saved; },
      findUnique: async () => saved,
    },
    product: {
      findMany: async () => [{ id: "product-1", buyingPrice: 1000 }],
      update: async () => { stockWrites += 1; },
    },
    stockReceiptItem: { create: async () => {} },
    stockMovement: { create: async () => {} },
  };
  const controller = loadController({ $transaction: async (work) => work(tx) });
  const request = { user: { userId: "owner-1" }, body: { requestKey: crypto.randomUUID(), paymentMethod: "CREDIT", paidAtReceipt: 0, items: [{ productId: "product-1", quantity: 1, unitCost: 1000 }] } };
  const first = response();
  await controller.receive(request, first);
  assert.equal(first.statusCode, 201);
  t.mock.timers.tick(5000);
  let error;
  const retry = response();
  await controller.receive(request, retry, (caught) => { error = caught; });
  assert.equal(error, undefined);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.payload.reused, true);
  assert.equal(stockWrites, 1);

  saved.requestHash = crypto.createHash("sha256").update(JSON.stringify({
    allocationMode: "DIRECT", totalGroceryBill: null, supplierId: null, sourceOrderId: null,
    invoiceNumber: null, note: null, transportCost: 0, otherCost: 0, paymentMethod: "CREDIT",
    paidAtReceipt: 0, paymentReference: null, receivedAt: saved.receivedAt.toISOString(), items: request.body.items,
  })).digest("hex");
  const oldReceiptRetry = response();
  await controller.receive(request, oldReceiptRetry);
  assert.equal(oldReceiptRetry.payload.reused, true);
  assert.equal(stockWrites, 1);

  const changedRequest = { ...request, body: { ...request.body, items: [{ productId: "product-1", quantity: 2, unitCost: 1000 }] } };
  let changedError;
  await controller.receive(changedRequest, response(), (caught) => { changedError = caught; });
  assert.equal(changedError.status, 409);
  assert.equal(stockWrites, 1);
});
