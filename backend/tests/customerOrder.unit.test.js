const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/customerOrder.controller.js");

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; } };
}

function loadController(prismaMock) {
  delete require.cache[controllerPath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
  require.cache[shopAccessPath] = { id: shopAccessPath, filename: shopAccessPath, loaded: true, exports: { getShopIdForUser: async () => "shop-1" } };
  return require(controllerPath);
}

function reservedOrder(overrides = {}) {
  return {
    id: "customer-order-1",
    shopId: "shop-1",
    status: "OUT_FOR_DELIVERY",
    customerName: "Asha",
    customerPhone: "0712345678",
    totalAmount: 12000,
    convertedSale: null,
    items: [{ productId: "product-1", quantity: 2, unitPrice: 6000, buyingPrice: 3500, pricingTier: "RETAIL", product: { id: "product-1", name: "Rice", unit: "pcs", buyingPrice: 3500 } }],
    ...overrides,
  };
}

test("catalog order completion records one online sale without deducting reserved stock twice", async () => {
  let saleData;
  let orderUpdate;
  let productMutation = false;
  const tx = {
    customerOrder: {
      findFirst: async () => reservedOrder(),
      updateMany: async (args) => { orderUpdate = args; return { count: 1 }; },
      update: async () => { throw new Error("legacy path should not run"); },
    },
    shop: { update: async () => ({ nextSaleNumber: 42 }) },
    sale: { create: async ({ data }) => { saleData = data; return { id: "sale-1", receiptNumber: data.receiptNumber, ...data }; } },
    cashSession: { findFirst: async () => ({ id: "session-1" }) },
    debt: { create: async () => { throw new Error("cash order should not create debt"); } },
    product: new Proxy({}, { get() { productMutation = true; throw new Error("stock must already be reserved"); } }),
  };
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $transaction: async (work) => work(tx),
    sale: { findFirst: async () => null },
  };
  const ctrl = loadController(prismaMock);
  const res = response();

  await ctrl.convertToSale({ user: { userId: "owner-1", role: "MERCHANT" }, params: { id: "customer-order-1" }, body: { paymentMethod: "CASH" } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(orderUpdate.data.status, "DELIVERED");
  assert.equal(saleData.channel, "ONLINE");
  assert.equal(saleData.customerOrderId, "customer-order-1");
  assert.equal(saleData.cashSessionId, "session-1");
  assert.equal(saleData.profit, 5000);
  assert.equal(saleData.items.create[0].buyingPrice, 3500);
  assert.equal(productMutation, false);
});

test("already converted catalog order is idempotent and does not create another sale", async () => {
  let created = false;
  const tx = {
    customerOrder: { findFirst: async () => reservedOrder({ convertedSale: { id: "sale-1", receiptNumber: 10 } }) },
    sale: { create: async () => { created = true; } },
  };
  const prismaMock = { shop: { findUnique: async () => ({ id: "shop-1" }) }, $transaction: async (work) => work(tx) };
  const ctrl = loadController(prismaMock);
  const res = response();

  await ctrl.convertToSale({ user: { userId: "owner-1", role: "MERCHANT" }, params: { id: "customer-order-1" }, body: { paymentMethod: "CASH" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.reused, true);
  assert.equal(created, false);
});

test("credit catalog order creates a single linked receivable", async () => {
  let debtData;
  const tx = {
    customerOrder: { findFirst: async () => reservedOrder(), updateMany: async () => ({ count: 1 }) },
    shop: { update: async () => ({ nextSaleNumber: 5 }) },
    sale: { create: async ({ data }) => ({ id: "sale-credit", receiptNumber: data.receiptNumber, ...data }) },
    debt: { create: async ({ data }) => { debtData = data; return data; } },
  };
  const prismaMock = { shop: { findUnique: async () => ({ id: "shop-1" }) }, $transaction: async (work) => work(tx), sale: { findFirst: async () => null } };
  const ctrl = loadController(prismaMock);
  const res = response();

  await ctrl.convertToSale({ user: { userId: "owner-1", role: "MERCHANT" }, params: { id: "customer-order-1" }, body: { paymentMethod: "CREDIT" } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(debtData.saleId, "sale-credit");
  assert.equal(debtData.customerPhone, "+255712345678");
  assert.equal(debtData.amount, 12000);
});
