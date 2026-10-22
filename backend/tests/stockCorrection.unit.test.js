const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const cachePath = path.resolve(__dirname, "../src/services/dashboard-cache.service.js");
const receiptPath = path.resolve(__dirname, "../src/controllers/stockReceipt.controller.js");
const correctionPath = path.resolve(__dirname, "../src/controllers/stockReceiptCorrection.controller.js");
const stockPath = path.resolve(__dirname, "../src/controllers/stock.controller.js");

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return this; } };
}

function load(pathToController, prisma) {
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prisma };
  require.cache[shopAccessPath] = { id: shopAccessPath, filename: shopAccessPath, loaded: true, exports: { getShopIdForUser: async () => "shop-1" } };
  require.cache[cachePath] = { id: cachePath, filename: cachePath, loaded: true, exports: { invalidateDashboardHistory: async () => {} } };
  delete require.cache[receiptPath];
  delete require.cache[correctionPath];
  delete require.cache[stockPath];
  return require(pathToController);
}

function fixture({ stock = 5, paid = 0, sourceOrderId = null, credits = [] } = {}) {
  const state = { stock, received: 2, orderReceived: 2, orderStatus: "PARTIALLY_RECEIVED", correction: null, movements: [] };
  const receipt = {
    id: "receipt-1", shopId: "shop-1", sourceOrderId, invoiceNumber: "INV-1", note: null,
    totalProductCost: 200, totalLandedCost: 200, transportCost: 0, otherCost: 0, paidAtReceipt: paid,
    estimatedAllocation: false, voidedAt: null, paymentCorrections: [], paymentAllocations: [], credits,
    items: [{ id: "item-1", productId: "product-1", quantity: 2, unitCost: 100, productCost: 200, allocatedAdditionalCost: 0, landedTotalCost: 200, landedUnitCost: 100 }],
  };
  const tx = {
    $queryRawUnsafe: async () => [],
    stockReceiptCorrection: {
      findFirst: async () => state.correction,
      create: async ({ data }) => { state.correction = { id: "correction-1", ...data, createdAt: new Date() }; return state.correction; },
    },
    stockReceipt: {
      findFirst: async ({ where, select }) => where.id === receipt.id && where.shopId === receipt.shopId ? (select ? { sourceOrderId } : receipt) : null,
      update: async ({ data }) => { Object.assign(receipt, data); return receipt; },
    },
    product: {
      findFirst: async ({ where }) => where.id === "product-1" && where.shopId === "shop-1" ? { id: "product-1", currentStock: state.stock } : null,
      updateMany: async ({ where, data }) => {
        if (where.currentStock !== state.stock) return { count: 0 };
        state.stock = data.currentStock;
        return { count: 1 };
      },
    },
    stockMovement: { create: async ({ data }) => { state.movements.push(data); return data; } },
    stockReceiptItem: { update: async ({ data }) => { Object.assign(receipt.items[0], data); state.received = data.quantity; } },
    orderItem: {
      findFirst: async () => ({ id: "order-item-1", quantity: 4, receivedQuantity: state.orderReceived }),
      update: async ({ data }) => { state.orderReceived += data.receivedQuantity.increment; },
      findMany: async () => [{ quantity: 4, receivedQuantity: state.orderReceived }],
    },
    order: {
      findFirst: async () => ({ status: state.orderStatus }),
      update: async ({ data }) => { state.orderStatus = data.status; },
    },
  };
  const prisma = { ...tx, $transaction: async (work) => {
    const previous = { ...state, movements: [...state.movements] };
    try { return await work(tx); }
    catch (error) { Object.assign(state, previous); throw error; }
  } };
  return { state, receipt, controller: load(correctionPath, prisma) };
}

function correctionRequest(quantity, key = "0b3c4f12-3fe5-4ef5-9d75-f611cde8c871") {
  return { params: { id: "receipt-1" }, user: { userId: "owner-1" }, body: { requestKey: key, reason: "Wrong count", items: [{ id: "item-1", quantity }] } };
}

test("receipt quantity correction updates stock, order and receipt once, with before/after history", async () => {
  const { state, receipt, controller } = fixture({ sourceOrderId: "order-1" });
  const first = response();
  await controller.correct(correctionRequest(1), first, assert.fail);
  assert.equal(first.statusCode, 201);
  assert.equal(state.stock, 4);
  assert.equal(state.received, 1);
  assert.equal(state.orderReceived, 1);
  assert.equal(state.orderStatus, "PARTIALLY_RECEIVED");
  assert.equal(receipt.totalLandedCost, 100);
  assert.deepEqual(state.movements.map((movement) => [movement.type, movement.quantity, movement.receiptCorrectionId]), [["OUT", 1, "correction-1"]]);
  assert.equal(first.payload.correction.before.totalLandedCost, 200);
  assert.equal(first.payload.correction.after.totalLandedCost, 100);
  const retry = response();
  await controller.correct(correctionRequest(1), retry, assert.fail);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.payload.reused, true);
  assert.equal(state.stock, 4);
  assert.equal(state.movements.length, 1);
});

test("receipt correction refuses stock already consumed, overpaid totals and supplier credits", async () => {
  for (const options of [{ stock: 0 }, { paid: 150 }, { credits: [{ items: [{ stockReceiptItemId: "item-1", quantity: 1, amount: 100 }] }] }]) {
    const { state, controller } = fixture(options);
    const res = response();
    await controller.correct(correctionRequest(1), res, assert.fail);
    assert.equal(res.statusCode, 409);
    assert.equal(state.movements.length, 0);
  }
});

test("receipt correction rejects a cross-shop receipt before writing", async () => {
  const { state, controller } = fixture();
  const res = response();
  await controller.correct({ ...correctionRequest(1), params: { id: "other-shop-receipt" } }, res, assert.fail);
  assert.equal(res.statusCode, 404);
  assert.equal(state.movements.length, 0);
});

test("direct receipt lookup is shop-scoped and hides retry fingerprints", async () => {
  const controller = load(receiptPath, { stockReceipt: {
    findFirst: async ({ where }) => where.shopId === "shop-1" && where.id === "receipt-1"
      ? { id: "receipt-1", requestKey: "private", requestHash: "private-hash", items: [], stockCorrections: [] } : null,
  } });
  const found = response();
  await controller.get({ params: { id: "receipt-1" }, user: { userId: "owner-1" } }, found, assert.fail);
  assert.equal(found.payload.receipt.id, "receipt-1");
  assert.equal("requestKey" in found.payload.receipt, false);
  const missing = response();
  await controller.get({ params: { id: "other-shop-receipt" }, user: { userId: "owner-1" } }, missing, assert.fail);
  assert.equal(missing.statusCode, 404);
});

test("an unpaid, unused receipt can be fully reversed without deleting its audit trail", async () => {
  const { state, receipt, controller } = fixture({ stock: 2, sourceOrderId: "order-1" });
  const res = response();
  await controller.correct(correctionRequest(0), res, assert.fail);
  assert.equal(res.statusCode, 201);
  assert.equal(state.stock, 0);
  assert.equal(state.orderReceived, 0);
  assert.equal(state.orderStatus, "PENDING");
  assert.equal(receipt.totalLandedCost, 0);
  assert.ok(receipt.voidedAt instanceof Date);
  assert.equal(res.payload.correction.before.items[0].quantity, 2);
  assert.equal(res.payload.correction.after.items[0].quantity, 0);
});

test("a cancelled supplier order cannot gain stock through a receipt correction", async () => {
  const { state, controller } = fixture({ sourceOrderId: "order-1" });
  state.orderStatus = "CANCELLED";
  const res = response();
  await controller.correct(correctionRequest(3), res, assert.fail);
  assert.equal(res.statusCode, 409);
  assert.equal(state.stock, 5);
  assert.equal(state.orderReceived, 2);
});

test("an estimated-cost receipt permits invoice correction but not quantity reallocation", async () => {
  const { state, receipt, controller } = fixture();
  receipt.estimatedAllocation = true;
  const quantity = response();
  await controller.correct(correctionRequest(1), quantity, assert.fail);
  assert.equal(quantity.statusCode, 409);
  const metadata = response();
  await controller.correct({ ...correctionRequest(2), body: { ...correctionRequest(2).body, invoiceNumber: "INV-2" } }, metadata, assert.fail);
  assert.equal(metadata.statusCode, 201);
  assert.equal(state.stock, 5);
  assert.equal(receipt.invoiceNumber, "INV-2");
});

test("manual stock reversal is linked, retry-safe, and cannot make stock negative", async () => {
  let stock = 5;
  let saved;
  const original = { id: "manual-1", productId: "product-1", type: "IN", quantity: 2, manualAdjustment: true, stockBefore: 3, stockAfter: 5,
    stockReceiptId: null, reversalOfId: null, reversal: null };
  const tx = {
    $queryRawUnsafe: async () => [],
    stockMovement: {
      findFirst: async ({ where }) => where.id === original.id ? original : where.reversalOfId === original.id ? saved : null,
      create: async ({ data }) => { saved = { id: "reversal-1", ...data }; original.reversal = { id: saved.id }; return saved; },
    },
    product: {
      findFirst: async () => ({ id: "product-1", currentStock: stock }),
      updateMany: async ({ data }) => { stock = data.currentStock; return { count: 1 }; },
    },
  };
  const controller = load(stockPath, { ...tx, $transaction: async (work) => work(tx) });
  const req = { params: { id: original.id }, user: { userId: "owner-1" }, body: { requestKey: "0b3c4f12-3fe5-4ef5-9d75-f611cde8c871", reason: "Counted twice" } };
  const first = response();
  await controller.reverseManualMovement(req, first, assert.fail);
  assert.equal(first.statusCode, 201);
  assert.equal(stock, 3);
  assert.equal(saved.reversalOfId, original.id);
  const retry = response();
  await controller.reverseManualMovement(req, retry, assert.fail);
  assert.equal(retry.payload.reused, true);
  assert.equal(stock, 3);
});

test("manual reversal refuses legacy and source-linked rows, or stock already used", async () => {
  for (const original of [
    { id: "move-1", productId: "product-1", manualAdjustment: false, type: "IN", quantity: 2 },
    { id: "move-1", productId: "product-1", manualAdjustment: true, stockReceiptId: "receipt-1", type: "IN", quantity: 2 },
    { id: "move-1", productId: "product-1", manualAdjustment: true, stockBefore: 0, stockAfter: 2, type: "IN", quantity: 2 },
  ]) {
    let stock = original.manualAdjustment && !original.stockReceiptId ? 1 : 3;
    const tx = {
      $queryRawUnsafe: async () => [],
      stockMovement: {
        findFirst: async ({ where }) => where.id ? { ...original, reversal: null, reversalOfId: null } : null,
        create: async () => assert.fail("No reversal should be written"),
      },
      product: {
        findFirst: async () => ({ id: "product-1", currentStock: stock }),
        updateMany: async () => assert.fail("Stock must not change"),
      },
    };
    const controller = load(stockPath, { ...tx, $transaction: async (work) => work(tx) });
    let caught;
    await controller.reverseManualMovement({ params: { id: "move-1" }, user: { userId: "owner-1" }, body: { requestKey: "0b3c4f12-3fe5-4ef5-9d75-f611cde8c871", reason: "Wrong entry" } }, response(), (error) => { caught = error; });
    assert.equal(caught.status, 409);
    assert.equal(stock, original.manualAdjustment && !original.stockReceiptId ? 1 : 3);
  }
});
