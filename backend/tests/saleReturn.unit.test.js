const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const cashSessionPath = path.resolve(__dirname, "../src/lib/cashSession.js");
const dashboardCachePath = path.resolve(__dirname, "../src/services/dashboard-cache.service.js");
const cropHarvestSalesPath = path.resolve(__dirname, "../src/lib/cropHarvestSales.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/saleReturn.controller.js");
const requestKey = "12345678-1234-1234-1234-123456789abc";

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; } };
}

function loadController(prismaMock) {
  delete require.cache[controllerPath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
  require.cache[shopAccessPath] = { id: shopAccessPath, filename: shopAccessPath, loaded: true, exports: { getShopIdForUser: async () => "shop-1" } };
  require.cache[cashSessionPath] = { id: cashSessionPath, filename: cashSessionPath, loaded: true, exports: { findOpenCashSession: async () => ({ id: "cash-1" }) } };
  require.cache[dashboardCachePath] = { id: dashboardCachePath, filename: dashboardCachePath, loaded: true, exports: { invalidateDashboardHistory: async () => {} } };
  require.cache[cropHarvestSalesPath] = { id: cropHarvestSalesPath, filename: cropHarvestSalesPath, loaded: true, exports: { restoreCropHarvestAllocationQuantity: async () => {} } };
  return require(controllerPath);
}

function returnRequest(overrides = {}) {
  return {
    user: { userId: "owner-1" },
    params: { id: "sale-1" },
    body: {
      reason: "Customer returned item",
      requestKey,
      refundMethod: "CASH",
      items: [{ saleItemId: "sale-item-1", quantity: 1, restockQuantity: 1, damagedQuantity: 0 }],
      ...overrides,
    },
  };
}

function completedCashSale(quantity = 2) {
  return {
    id: "sale-1", shopId: "shop-1", receiptNumber: 1, status: "COMPLETED", paymentMethod: "CASH", debt: null,
    items: [{ id: "sale-item-1", saleId: "sale-1", productId: "product-1", name: "Soap", quantity, returnedQuantity: 0, totalPrice: 2000, unitPrice: 1000, buyingPrice: 500, product: { id: "product-1", name: "Soap", unit: "pcs" } }],
  };
}

test("partial cash return restores sellable stock once and reuses an identical retry", async () => {
  const sale = completedCashSale();
  let savedReturn;
  let stockRestored = 0;
  let movements = 0;
  let returnedQuantity = 0;
  const tx = {
    saleReturn: {
      findFirst: async () => savedReturn,
      create: async ({ data }) => {
        savedReturn = { id: "return-1", ...data, items: data.items.create.map((item, index) => ({ id: `return-item-${index + 1}`, ...item })) };
        return savedReturn;
      },
    },
    sale: { findFirst: async () => sale },
    saleItem: { updateMany: async ({ data }) => { returnedQuantity += data.returnedQuantity.increment; sale.items[0].returnedQuantity = returnedQuantity; return { count: 1 }; } },
    product: { updateMany: async ({ data }) => { stockRestored += data.currentStock.increment; return { count: 1 }; } },
    stockMovement: { create: async () => { movements += 1; } },
  };
  const controller = loadController({ $transaction: async (fn) => fn(tx) });
  const first = response();

  await controller.create(returnRequest(), first);

  assert.equal(first.statusCode, 201);
  assert.equal(first.payload.saleReturn.totalAmount, 1000);
  assert.equal(first.payload.saleReturn.refundAmount, 1000);
  assert.equal(first.payload.saleReturn.cashSessionId, "cash-1");
  assert.equal(stockRestored, 1);
  assert.equal(movements, 1);

  const retry = response();
  await controller.create(returnRequest(), retry);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.payload.reused, true);
  assert.equal(stockRestored, 1);
  assert.equal(movements, 1);
});

test("returning a credit sale reduces unpaid debt before refunding collected money", async () => {
  const sale = completedCashSale(3);
  sale.paymentMethod = "CREDIT";
  sale.items[0].totalPrice = 3000;
  sale.debt = { id: "debt-1", shopId: "shop-1", amount: 3000, amountPaid: 1000, status: "PARTIAL", note: null };
  let debtUpdate;
  let createdReturn;
  const tx = {
    saleReturn: {
      findFirst: async () => null,
      create: async ({ data }) => { createdReturn = data; return { id: "return-1", ...data, items: data.items.create }; },
    },
    sale: { findFirst: async () => sale },
    debt: { updateMany: async ({ where, data }) => { debtUpdate = { where, data }; return { count: 1 }; } },
    saleItem: { updateMany: async () => ({ count: 1 }) },
    product: { updateMany: async () => ({ count: 1 }) },
    stockMovement: { create: async () => {} },
  };
  const controller = loadController({ $transaction: async (fn) => fn(tx) });
  const res = response();

  await controller.create(returnRequest({ refundMethod: null, items: [{ saleItemId: "sale-item-1", quantity: 1, restockQuantity: 1, damagedQuantity: 0 }] }), res);

  assert.equal(res.statusCode, 201);
  assert.equal(createdReturn.totalAmount, 1000);
  assert.equal(createdReturn.debtReduction, 1000);
  assert.equal(createdReturn.refundAmount, 0);
  assert.equal(debtUpdate.where.amount, 3000);
  assert.equal(debtUpdate.where.amountPaid, 1000);
  assert.equal(debtUpdate.data.amount, 2000);
  assert.equal(debtUpdate.data.status, "PARTIAL");
});

test("return rejects quantities above the sale remainder without writing", async () => {
  let returnCreated = false;
  const tx = {
    saleReturn: { findFirst: async () => null, create: async () => { returnCreated = true; } },
    sale: { findFirst: async () => completedCashSale(2) },
  };
  const controller = loadController({ $transaction: async (fn) => fn(tx) });
  let error;

  await controller.create(returnRequest({ items: [{ saleItemId: "sale-item-1", quantity: 3, restockQuantity: 3, damagedQuantity: 0 }] }), response(), (nextError) => { error = nextError; });

  assert.equal(error.status, 409);
  assert.match(error.message, /exceeds the remaining quantity/);
  assert.equal(returnCreated, false);
});
