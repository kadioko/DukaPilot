const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const cashSessionPath = path.resolve(__dirname, "../src/lib/cashSession.js");
const cachePath = path.resolve(__dirname, "../src/services/dashboard-cache.service.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/supplierPayable.controller.js");

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

function loadController(prismaMock, shopId = "shop-1", openSession = null) {
  delete require.cache[controllerPath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
  require.cache[shopAccessPath] = { id: shopAccessPath, filename: shopAccessPath, loaded: true, exports: { getShopIdForUser: async () => shopId } };
  require.cache[cashSessionPath] = { id: cashSessionPath, filename: cashSessionPath, loaded: true, exports: { findOpenCashSession: async () => openSession } };
  require.cache[cachePath] = { id: cachePath, filename: cachePath, loaded: true, exports: { invalidateDashboardHistory: async () => {} } };
  return require(controllerPath);
}

function baseReceipt(overrides = {}) {
  return {
    id: "receipt-1", shopId: "shop-1", supplierId: "supplier-1", totalLandedCost: 10000, paidAtReceipt: 2000,
    paymentAllocations: [{ amount: 1000 }], credits: [{ items: [{ amount: 500 }] }], ...overrides,
  };
}

test("supplier receipt balance nets receipt-time payment, allocated payments, and credits", () => {
  const controller = loadController({});
  assert.equal(controller.balanceOf(baseReceipt()), 6500);
  assert.equal(controller.balanceOf(baseReceipt({ paidAtReceipt: 12000 })), -3500);
});

test("supplier receipt balance uses the latest linked receipt-payment correction", () => {
  const controller = loadController({});
  const receipt = baseReceipt({
    paymentCorrections: [
      { id: "correction-1", correctedAmount: 4000, createdAt: new Date("2026-10-01T10:00:00Z") },
      { id: "correction-2", previousCorrectionId: "correction-1", correctedAmount: 3000, createdAt: new Date("2026-10-02T10:00:00Z") },
    ],
  });
  assert.equal(controller.balanceOf(receipt), 5500);
});

test("receipt payment correction appends a linked, idempotent cash adjustment", async () => {
  const requestKey = "5b36cc9f-18e4-4ba2-9f4a-6644c8805c21";
  const openSession = { id: "cash-1" };
  let created;
  const tx = {
    $queryRawUnsafe: async (_sql, id, shopId) => { assert.equal(id, "receipt-1"); assert.equal(shopId, "shop-1"); },
    stockReceiptPaymentCorrection: {
      findFirst: async ({ where }) => created && where.requestKey === requestKey ? created : null,
      create: async ({ data }) => { created = { id: "correction-1", createdAt: new Date("2026-10-16T10:00:00Z"), ...data }; return created; },
    },
    stockReceipt: {
      findFirst: async () => ({ id: "receipt-1", shopId: "shop-1", supplierId: "supplier-1", totalLandedCost: 10000, paidAtReceipt: 5000, paymentMethod: "CASH", paymentCorrections: [], paymentAllocations: [], credits: [] }),
    },
  };
  const controller = loadController({ $transaction: (callback) => callback(tx), stockReceiptPaymentCorrection: tx.stockReceiptPaymentCorrection }, "shop-1", openSession);
  const req = { user: { userId: "owner-1" }, params: { receiptId: "receipt-1" }, body: { requestKey, correctedAmount: 4000, paymentMethod: "CASH", note: "Amount was entered incorrectly" } };
  const first = response();
  await controller.correctReceiptPayment(req, first);
  assert.equal(first.statusCode, 201);
  assert.deepEqual({ previousAmount: created.previousAmount, correctedAmount: created.correctedAmount, cashOutAdjustment: created.cashOutAdjustment, cashSessionId: created.cashSessionId }, { previousAmount: 5000, correctedAmount: 4000, cashOutAdjustment: -1000, cashSessionId: "cash-1" });

  const retry = response();
  await controller.correctReceiptPayment(req, retry);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.payload.reused, true);
  assert.equal(controller.balanceOf({ totalLandedCost: 10000, paidAtReceipt: 5000, paymentCorrections: [created], paymentAllocations: [], credits: [] }), 6000);
});

test("receipt payment correction also supports receipts without a supplier", async () => {
  let created;
  let query;
  const tx = {
    $queryRawUnsafe: async () => [],
    stockReceiptPaymentCorrection: {
      findFirst: async () => null,
      create: async ({ data }) => { created = data; return { id: "correction-unassigned", ...data }; },
    },
    stockReceipt: {
      findFirst: async (args) => {
        query = args.where;
        return { id: "receipt-unassigned", shopId: "shop-1", supplierId: null, totalLandedCost: 5000, paidAtReceipt: 5000, paymentMethod: "MPESA", paymentCorrections: [], paymentAllocations: [], credits: [] };
      },
    },
  };
  const controller = loadController({ $transaction: (callback) => callback(tx), stockReceiptPaymentCorrection: tx.stockReceiptPaymentCorrection });
  const res = response();
  await controller.correctReceiptPayment({
    user: { userId: "owner-1" },
    params: { receiptId: "receipt-unassigned" },
    body: { requestKey: "5b36cc9f-18e4-4ba2-9f4a-6644c8805c26", correctedAmount: 4500, paymentMethod: "MPESA", note: "Corrected receipt amount" },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(query, { id: "receipt-unassigned", shopId: "shop-1" });
  assert.equal(created.stockReceiptId, "receipt-unassigned");
});

test("receipt payment method correction rejects cash changes without an open cash shift", async () => {
  const tx = {
    $queryRawUnsafe: async () => [],
    stockReceiptPaymentCorrection: { findFirst: async () => null, create: async () => { throw new Error("must not create"); } },
    stockReceipt: { findFirst: async () => ({ id: "receipt-1", shopId: "shop-1", supplierId: "supplier-1", totalLandedCost: 10000, paidAtReceipt: 0, paymentMethod: "CREDIT", paymentCorrections: [], paymentAllocations: [], credits: [] }) },
  };
  const controller = loadController({ $transaction: (callback) => callback(tx), stockReceiptPaymentCorrection: tx.stockReceiptPaymentCorrection });
  const res = response();
  await controller.correctReceiptPayment({ user: { userId: "owner-1" }, params: { receiptId: "receipt-1" }, body: { requestKey: "5b36cc9f-18e4-4ba2-9f4a-6644c8805c22", correctedAmount: 2000, paymentMethod: "CASH", note: "Corrected method" } }, res);
  assert.equal(res.statusCode, 409);
});

test("receipt payment correction cannot exceed the remaining amount after other settlements", async () => {
  const tx = {
    $queryRawUnsafe: async () => [],
    stockReceiptPaymentCorrection: { findFirst: async () => null, create: async () => { throw new Error("must not create"); } },
    stockReceipt: { findFirst: async () => ({ id: "receipt-1", shopId: "shop-1", supplierId: "supplier-1", totalLandedCost: 10000, paidAtReceipt: 0, paymentMethod: "CREDIT", paymentCorrections: [], paymentAllocations: [{ amount: 7000 }], credits: [] }) },
  };
  const controller = loadController({ $transaction: (callback) => callback(tx), stockReceiptPaymentCorrection: tx.stockReceiptPaymentCorrection });
  const res = response();
  await controller.correctReceiptPayment({ user: { userId: "owner-1" }, params: { receiptId: "receipt-1" }, body: { requestKey: "5b36cc9f-18e4-4ba2-9f4a-6644c8805c23", correctedAmount: 4000, paymentMethod: "MPESA", note: "Corrected amount" } }, res);
  assert.equal(res.statusCode, 409);
});

test("receipt payment correction rejects amounts outside the database TZS range", async () => {
  const controller = loadController({ $transaction: async () => { throw new Error("must not start transaction"); } });
  const res = response();
  await controller.correctReceiptPayment({
    user: { userId: "owner-1" },
    params: { receiptId: "receipt-1" },
    body: { requestKey: "5b36cc9f-18e4-4ba2-9f4a-6644c8805c24", correctedAmount: 2_147_483_648, paymentMethod: "MPESA", note: "Invalid oversized correction" },
  }, res);
  assert.equal(res.statusCode, 400);
});

test("concurrent payment reversal uniqueness conflict returns an already-reversed conflict", async () => {
  const uniqueError = Object.assign(new Error("unique reversal constraint"), { code: "P2002" });
  const original = { id: "payment-1", shopId: "shop-1", amount: 1000, paymentMethod: "MPESA", allocations: [], reversal: null };
  const prismaMock = {
    $transaction: async (callback) => callback({
      supplierPayment: {
        findFirst: async ({ where }) => where.id === "payment-1" ? original : null,
        create: async () => { throw uniqueError; },
      },
      $queryRawUnsafe: async () => [],
    }),
    supplierPayment: {
      findFirst: async ({ where }) => where.reversalOfId === "payment-1" ? { id: "winner-reversal" } : null,
    },
  };
  const controller = loadController(prismaMock);
  const res = response();

  await controller.reversePayment({ user: { userId: "owner-1" }, params: { paymentId: "payment-1" }, body: { requestKey: "8e7dc5ec-7a78-4eb0-9fb9-e930a9a749b1" } }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.payload.error, /already been reversed/i);
});

test("concurrent supplier-credit reversal uniqueness conflict returns an already-reversed conflict", async () => {
  const uniqueError = Object.assign(new Error("unique reversal constraint"), { code: "P2002" });
  const original = { id: "credit-1", shopId: "shop-1", stockReceiptId: "receipt-1", supplierId: "supplier-1", kind: "CREDIT_NOTE", items: [], reversal: null };
  const prismaMock = {
    $transaction: async (callback) => callback({
      supplierCredit: {
        findFirst: async ({ where }) => where.id === "credit-1" ? original : null,
        create: async () => { throw uniqueError; },
      },
      $queryRawUnsafe: async () => [],
    }),
    supplierCredit: {
      findFirst: async ({ where }) => where.reversalOfId === "credit-1" ? { id: "winner-reversal" } : null,
    },
  };
  const controller = loadController(prismaMock);
  const res = response();

  await controller.reverseCredit({ user: { userId: "owner-1" }, params: { creditId: "credit-1" }, body: { requestKey: "8e7dc5ec-7a78-4eb0-9fb9-e930a9a749b2" } }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.payload.error, /already been reversed/i);
});

test("partial supplier return credits distribute rounding so a full return equals original landed cost", () => {
  const controller = loadController({});
  const line = { quantity: 2, landedTotalCost: 1001 };
  const first = controller.returnCreditAmount(line, 1, 0);
  const second = controller.returnCreditAmount(line, 2, first);

  assert.equal(first, 501);
  assert.equal(second, 500);
  assert.equal(first + second, line.landedTotalCost);
});

test("supplier balance search is scoped to the active branch", async () => {
  const seen = [];
  const prismaMock = {
    $queryRawUnsafe: async (_sql, ...params) => {
      seen.push(params);
      return seen.length === 1 ? [{ id: "supplier-1", name: "Branch supplier", phone: "255700000001", balance: 0n, current: 0n, days31To60: 0n, days61To90: 0n, over90: 0n, receiptCount: 1 }] : [{ total: 1 }];
    },
  };
  const controller = loadController(prismaMock, "branch-2");
  const res = response();

  await controller.list({ user: { userId: "owner-1" }, query: { page: "1", limit: "25" } }, res);

  assert.equal(seen[0][0], "branch-2");
  assert.equal(seen[1][0], "branch-2");
  assert.equal(res.payload.suppliers[0].balance, 0);
});

test("payment allocation is tenant-scoped and idempotent for an uncertain retry", async () => {
  const requestKey = "8e7dc5ec-7a78-4eb0-9fb9-e930a9a749a1";
  const paidAt = "2026-10-16T09:00:00.000Z";
  const allocations = [{ stockReceiptId: "receipt-1", amount: 3000 }];
  const requestHash = crypto.createHash("sha256").update(JSON.stringify({ amount: 3000, method: "MPESA", paymentReference: "MP123", note: null, paidAt, allocations })).digest("hex");
  let created = 0;
  const tx = {
    $queryRawUnsafe: async (_sql, id, shopId) => { assert.equal(id, "receipt-1"); assert.equal(shopId, "branch-2"); },
    supplierPayment: {
      findFirst: async ({ where }) => where.requestKey === requestKey && created ? { id: "payment-1", shopId: "branch-2", requestKey, requestHash, amount: 3000, allocations } : null,
      create: async ({ data }) => { created += 1; assert.equal(data.shopId, "branch-2"); return { id: "payment-1", ...data, allocations: data.allocations.create }; },
    },
    stockReceipt: { findMany: async ({ where }) => {
      assert.equal(where.shopId, "branch-2");
      return [{ id: "receipt-1", shopId: "branch-2", supplierId: "supplier-1", totalLandedCost: 10000, paidAtReceipt: 2000, paymentAllocations: [], credits: [] }];
    } },
  };
  const prismaMock = { $transaction: (callback) => callback(tx), supplierPayment: tx.supplierPayment };
  const controller = loadController(prismaMock, "branch-2");
  const req = { user: { userId: "owner-1" }, body: { requestKey, amount: 3000, paymentMethod: "MPESA", paymentReference: "MP123", paidAt, allocations } };
  const first = response();
  await controller.recordPayment(req, first);
  assert.equal(first.statusCode, 201);
  assert.equal(created, 1);

  const retry = response();
  await controller.recordPayment(req, retry);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.payload.reused, true);
  assert.equal(created, 1);
});

test("payment allocation cannot exceed the remaining receipt balance", async () => {
  let creates = 0;
  const tx = {
    $queryRawUnsafe: async () => [],
    supplierPayment: { findFirst: async () => null, create: async () => { creates += 1; } },
    stockReceipt: { findMany: async () => [{ id: "receipt-1", shopId: "shop-1", supplierId: "supplier-1", totalLandedCost: 10000, paidAtReceipt: 8000, paymentAllocations: [], credits: [] }] },
  };
  const controller = loadController({ $transaction: (callback) => callback(tx), supplierPayment: tx.supplierPayment });
  const res = response();

  await controller.recordPayment({ user: { userId: "owner-1" }, body: { requestKey: "8e7dc5ec-7a78-4eb0-9fb9-e930a9a749a2", amount: 3000, paymentMethod: "MPESA", allocations: [{ stockReceiptId: "receipt-1", amount: 3000 }] } }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(creates, 0);
});

test("supplier return cannot exceed the quantity not already returned", async () => {
  let stockChanged = false;
  const tx = {
    $queryRawUnsafe: async () => [],
    supplierCredit: { findFirst: async () => null },
    stockReceipt: {
      findMany: async () => [{ id: "receipt-1", shopId: "shop-1", supplierId: "supplier-1", totalLandedCost: 10000, paidAtReceipt: 0, paymentAllocations: [], credits: [] }],
      findFirst: async () => ({ id: "receipt-1", supplierId: "supplier-1", items: [{ id: "line-1", quantity: 5, landedUnitCost: 1000, landedTotalCost: 5000, product: { id: "product-1", currentStock: 10, shopId: "shop-1" } }] }),
    },
    supplierCreditLine: { aggregate: async () => ({ _sum: { quantity: 4 } }) },
    product: { updateMany: async () => { stockChanged = true; return { count: 1 }; } },
  };
  const controller = loadController({ $transaction: (callback) => callback(tx) });
  const res = response();

  await controller.recordCredit({ user: { userId: "owner-1" }, body: { stockReceiptId: "receipt-1", requestKey: "8e7dc5ec-7a78-4eb0-9fb9-e930a9a749a3", kind: "RETURN", items: [{ stockReceiptItemId: "line-1", quantity: 2 }] } }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(stockChanged, false);
});

test("supplier return cannot claim more credit than the original landed cost", async () => {
  let stockChanged = false;
  const tx = {
    $queryRawUnsafe: async () => [],
    supplierCredit: { findFirst: async () => null },
    stockReceipt: {
      findMany: async () => [{ id: "receipt-1", shopId: "shop-1", supplierId: "supplier-1", totalLandedCost: 10000, paidAtReceipt: 0, paymentAllocations: [], credits: [] }],
      findFirst: async () => ({ id: "receipt-1", supplierId: "supplier-1", items: [{ id: "line-1", quantity: 5, landedUnitCost: 1000, product: { id: "product-1", currentStock: 10, shopId: "shop-1" } }] }),
    },
    supplierCreditLine: { aggregate: async () => ({ _sum: { quantity: 0 } }) },
    product: { updateMany: async () => { stockChanged = true; return { count: 1 }; } },
  };
  const controller = loadController({ $transaction: (callback) => callback(tx) });
  const res = response();

  await controller.recordCredit({ user: { userId: "owner-1" }, body: { stockReceiptId: "receipt-1", requestKey: "8e7dc5ec-7a78-4eb0-9fb9-e930a9a749a5", kind: "RETURN", items: [{ stockReceiptItemId: "line-1", quantity: 1, amount: 1000000 }] } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(stockChanged, false);
});

test("returning a zero-cost sample still records a stock movement and receipt-linked quantity", async () => {
  let movement;
  const tx = {
    $queryRawUnsafe: async () => [],
    supplierCredit: { findFirst: async () => null, create: async ({ data }) => ({ id: "credit-zero", ...data, items: [{ id: "credit-line-zero", stockReceiptItemId: "line-free", quantity: 1, amount: 0 }] }) },
    stockReceipt: {
      findMany: async () => [{ id: "receipt-1", shopId: "shop-1", supplierId: "supplier-1", totalLandedCost: 0, paidAtReceipt: 0, paymentAllocations: [], credits: [] }],
      findFirst: async () => ({ id: "receipt-1", supplierId: "supplier-1", items: [{ id: "line-free", quantity: 1, landedUnitCost: 0, landedTotalCost: 0, product: { id: "product-free", currentStock: 1, shopId: "shop-1" } }] }),
    },
    supplierCreditLine: { aggregate: async () => ({ _sum: { quantity: 0 } }) },
    product: { updateMany: async () => ({ count: 1 }) },
    stockMovement: { create: async ({ data }) => { movement = data; } },
  };
  const controller = loadController({ $transaction: (callback) => callback(tx) });
  const res = response();

  await controller.recordCredit({ user: { userId: "owner-1" }, body: { stockReceiptId: "receipt-1", requestKey: "8e7dc5ec-7a78-4eb0-9fb9-e930a9a749a4", kind: "RETURN", items: [{ stockReceiptItemId: "line-free", quantity: 1 }] } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.credit.items[0].amount, 0);
  assert.deepEqual({ type: movement.type, quantity: movement.quantity, productId: movement.productId }, { type: "OUT", quantity: 1, productId: "product-free" });
});
