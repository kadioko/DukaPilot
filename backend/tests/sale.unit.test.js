const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/sale.controller.js");

function createRes() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function loadController(prismaMock) {
  delete require.cache[controllerPath];
  delete require.cache[shopAccessPath];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: prismaMock,
  };
  require.cache[shopAccessPath] = {
    id: shopAccessPath,
    filename: shopAccessPath,
    loaded: true,
    exports: { getShopIdForUser: async () => "shop-1", getBillingShopIdForUser: async () => "shop-1" },
  };
  return require(controllerPath);
}

test("sales history caps a client-requested page to a bounded payload", async () => {
  let findManyArgs;
  const prismaMock = {
    sale: {
      findMany: async (args) => { findManyArgs = args; return []; },
      count: async () => 0,
    },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.list({ user: { userId: "owner-1", role: "MERCHANT" }, query: { limit: "100000", offset: "-5" } }, res);

  assert.equal(findManyArgs.take, 200);
  assert.equal(findManyArgs.skip, 0);
  assert.equal(res.payload.limit, 200);
});

test("sales history applies shop-scoped search and filters before pagination", async () => {
  let findManyArgs;
  let countWhere;
  const prismaMock = {
    sale: {
      findMany: async (args) => { findManyArgs = args; return []; },
      count: async ({ where }) => { countWhere = where; return 0; },
    },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.list({
    user: { userId: "owner-1", role: "MERCHANT" },
    query: { limit: "20", offset: "20", search: "DP-42", paymentMethod: "mpesa", status: "voided" },
  }, res);

  assert.equal(findManyArgs.take, 20);
  assert.equal(findManyArgs.skip, 20);
  assert.equal(findManyArgs.where.shopId, "shop-1");
  assert.equal(findManyArgs.where.paymentMethod, "MPESA");
  assert.equal(findManyArgs.where.status, "VOIDED");
  assert.equal(countWhere, findManyArgs.where);
  assert.deepEqual(findManyArgs.where.OR.at(-1), { receiptNumber: 42 });
  assert.ok(findManyArgs.where.OR.some((entry) => entry.customerPhone));
  assert.ok(findManyArgs.where.OR.some((entry) => entry.items?.some?.name));
});

test("cashier sales history is scoped to their own sales unless they have Reports permission", async () => {
  const whereByRequest = [];
  const prismaMock = {
    sale: {
      findMany: async ({ where }) => { whereByRequest.push(where); return []; },
      count: async () => 0,
    },
  };
  const ctrl = loadController(prismaMock);
  const cashierRes = createRes();
  const reportsRes = createRes();

  await ctrl.list({ user: { userId: "owner-1", staffId: "staff-1", role: "MERCHANT", permissions: { canViewReports: false } }, query: {} }, cashierRes);
  await ctrl.list({ user: { userId: "owner-1", staffId: "staff-1", role: "MERCHANT", permissions: { canViewReports: true } }, query: {} }, reportsRes);

  assert.equal(whereByRequest[0].shopId, "shop-1");
  assert.equal(whereByRequest[0].createdByStaffId, "staff-1");
  assert.equal("createdByStaffId" in whereByRequest[1], false);
});

test("cashier cannot fetch another person's sale by ID", async () => {
  let where;
  const prismaMock = { sale: { findFirst: async (args) => { where = args.where; return null; } } };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.get({ user: { userId: "owner-1", staffId: "staff-1", role: "MERCHANT", permissions: { canViewReports: false } }, params: { id: "sale-owner" } }, res);

  assert.equal(where.shopId, "shop-1");
  assert.equal(where.createdByStaffId, "staff-1");
  assert.equal(res.statusCode, 404);
});

test("cashier sales summary counts only their sales", async () => {
  let summaryWhere;
  const prismaMock = {
    sale: {
      findMany: async ({ where }) => { summaryWhere = where; return []; },
      aggregate: async () => ({ _sum: { totalAmount: 0, profit: 0 }, _count: { id: 0 } }),
    },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.summary({ user: { userId: "owner-1", staffId: "staff-1", role: "MERCHANT", permissions: { canViewReports: false } }, query: { period: "today" } }, res);

  assert.equal(summaryWhere.shopId, "shop-1");
  assert.equal(summaryWhere.createdByStaffId, "staff-1");
  assert.equal(res.payload.totalProfit, null);
});

test("sale create rejects insufficient stock", async () => {
  const prismaMock = {
    shop: {
      findUnique: async () => ({ id: "shop-1", allowVariableSalePrices: false }),
    },
    product: {
      findMany: async () => [
        { id: "prod-1", name: "Rice", unit: "kg", currentStock: 2, sellingPrice: 3200, buyingPrice: 2800 },
      ],
    },
  };

  const ctrl = loadController(prismaMock);
  const req = {
    user: { userId: "user-1" },
    body: {
      items: [{ productId: "prod-1", quantity: 3 }],
    },
  };
  const res = createRes();

  await ctrl.create(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /Insufficient stock for Rice/);
});

test("sale create rejects an internal-use feed even when stock is available", async () => {
  let transactionStarted = false;
  const ctrl = loadController({
    shop: { findUnique: async () => ({ id: "shop-1", allowVariableSalePrices: true }) },
    product: { findMany: async () => [{ id: "feed-1", name: "Layers feed", unit: "bag", currentStock: 8, sellingPrice: 0, buyingPrice: 85000, isInternalUse: true }] },
    $transaction: async () => { transactionStarted = true; },
  });
  const res = createRes();
  await ctrl.create({ user: { userId: "owner-1" }, body: { items: [{ productId: "feed-1", quantity: 1 }] } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /internal use/);
  assert.equal(transactionStarted, false);
});

test("a mixed service and product sale only changes physical stock", async () => {
  let created;
  const movements = [];
  const updates = [];
  const tx = {
    shop: { update: async () => ({ nextSaleNumber: 9 }) },
    sale: { create: async ({ data }) => { created = data; return { id: "sale-1", ...data, items: data.items.create }; } },
    product: { updateMany: async (args) => { updates.push(args); return { count: 1 }; } },
    stockMovement: { create: async (args) => movements.push(args) },
    farmGroup: { findFirst: async () => null },
  };
  let serviceWhere;
  const ctrl = loadController({
    shop: { findUnique: async () => ({ allowVariableSalePrices: false }) },
    product: { findMany: async () => [{ id: "soap", name: "Soap", unit: "pcs", currentStock: 4, sellingPrice: 2000, buyingPrice: 1000 }] },
    service: { findMany: async ({ where }) => { serviceWhere = where; return [{ id: "wash", name: "Car wash", unit: "service", defaultSellingPrice: 10000, defaultEstimatedUnitCost: 0 }]; } },
    $transaction: async (fn) => fn(tx),
  });
  const res = createRes();
  await ctrl.create({ user: { userId: "owner-1", role: "MERCHANT" }, body: { paymentMethod: "MPESA", items: [{ serviceId: "wash", quantity: 2 }, { productId: "soap", quantity: 1 }] } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(serviceWhere.shopId, "shop-1");
  assert.equal(created.totalAmount, 22000);
  assert.equal(created.items.create[0].name, "Car wash");
  assert.equal(created.items.create[0].buyingPrice, 0);
  assert.equal(created.items.create[0].productId, undefined);
  assert.equal(updates.length, 1);
  assert.equal(movements.length, 1);
  assert.equal(movements[0].data.productId, "soap");
});

test("a service from another business cannot be sold", async () => {
  const ctrl = loadController({
    shop: { findUnique: async () => ({ allowVariableSalePrices: false }) },
    product: { findMany: async () => [] },
    service: { findMany: async () => [] },
  });
  const res = createRes();
  await ctrl.create({ user: { userId: "owner-1" }, body: { items: [{ serviceId: "other-shop", quantity: 1 }] } }, res);
  assert.equal(res.statusCode, 400);
});

test("sale validation rejects ambiguous or malformed service lines", async () => {
  const { saleCreateValidation } = require("../src/middleware/validation");
  const { validationResult } = require("express-validator");
  for (const item of [
    { productId: "p", serviceId: "s", quantity: 1 },
    { productId: "p", serviceId: { id: "s" }, quantity: 1 },
    { serviceId: "s", quantity: 2147483648 },
    { quantity: 1 },
  ]) {
    const req = { body: { items: [item] } };
    for (const validator of saleCreateValidation) if (validator.run) await validator.run(req);
    assert.equal(validationResult(req).isEmpty(), false, JSON.stringify(item));
  }
});

test("service listing hides costs from cashiers and prices from stock-only staff", async () => {
  const serviceControllerPath = path.resolve(__dirname, "../src/controllers/posService.controller.js");
  loadController({ service: {
    findMany: async () => [{ id: "wash", name: "Car wash", defaultSellingPrice: 10000, defaultEstimatedUnitCost: 3000 }],
    count: async () => 1,
  } });
  delete require.cache[serviceControllerPath];
  const ctrl = require(serviceControllerPath);
  const cashier = createRes();
  await ctrl.list({ user: { staffId: "staff-1", role: "MERCHANT", permissions: { canSell: true } }, query: {} }, cashier);
  assert.equal(cashier.payload.services[0].defaultSellingPrice, 10000);
  assert.equal(cashier.payload.services[0].defaultEstimatedUnitCost, undefined);
  const stockOnly = createRes();
  await ctrl.list({ user: { staffId: "staff-2", role: "MERCHANT", permissions: { canViewStock: true } }, query: {} }, stockOnly);
  assert.equal(stockOnly.payload.services[0].defaultSellingPrice, null);
  assert.equal(stockOnly.payload.services[0].defaultEstimatedUnitCost, undefined);
});

test("service creation retries reuse the original request without duplicating", async () => {
  const serviceControllerPath = path.resolve(__dirname, "../src/controllers/posService.controller.js");
  let saved;
  loadController({ service: {
    create: async ({ data }) => { if (saved) throw Object.assign(new Error("duplicate"), { code: "P2002" }); saved = data; return saved; },
    findUnique: async () => saved,
  } });
  delete require.cache[serviceControllerPath];
  const ctrl = require(serviceControllerPath);
  const req = { user: { role: "MERCHANT", userId: "owner-1" }, body: { requestId: "12345678-1234-4234-8234-123456789abc", name: "Wash", defaultSellingPrice: 10000 } };
  const first = createRes();
  await ctrl.create(req, first);
  assert.equal(first.statusCode, 201);
  const retry = createRes();
  await ctrl.create(req, retry);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.payload.reused, true);
  const conflict = createRes();
  await ctrl.create({ ...req, body: { ...req.body, defaultSellingPrice: 20000 } }, conflict);
  assert.equal(conflict.statusCode, 409);
});

test("sale create calculates total and profit before persisting transaction", async () => {
  let capturedSaleCreate;
  let stockUpdates = 0;
  let stockMovements = 0;

  const tx = {
    shop: {
      update: async () => ({ nextSaleNumber: 42 }),
    },
    sale: {
      create: async ({ data }) => {
        capturedSaleCreate = data;
        return {
          id: "sale-123456",
          ...data,
          items: data.items.create.map((item) => ({
            ...item,
            product: { id: item.productId, name: item.productId, unit: "pcs" },
          })),
        };
      },
    },
    product: {
      updateMany: async () => {
        stockUpdates += 1;
        return { count: 1 };
      },
    },
    farmGroup: { findFirst: async () => null },
    stockMovement: {
      create: async () => {
        stockMovements += 1;
      },
    },
  };

  const prismaMock = {
    shop: {
      findUnique: async () => ({ id: "shop-1", allowVariableSalePrices: true }),
    },
    product: {
      findMany: async () => [
        { id: "prod-1", name: "Soap", unit: "pcs", currentStock: 8, sellingPrice: 1500, promotionPrice: 1400, promotionStartsAt: new Date(Date.now() - 60_000), promotionEndsAt: new Date(Date.now() + 60_000), buyingPrice: 1000 },
        { id: "prod-2", name: "Sugar", unit: "kg", currentStock: 4, sellingPrice: 3200, buyingPrice: 2800 },
      ],
    },
    $transaction: async (fn) => fn(tx),
  };

  const ctrl = loadController(prismaMock);
  const req = {
    user: { userId: "owner-1", staffId: "cashier-1", role: "MERCHANT" },
    body: {
      paymentMethod: "cash",
      items: [
        { productId: "prod-1", quantity: 2 },
        { productId: "prod-2", quantity: 1, unitPrice: 3500 },
      ],
    },
  };
  const res = createRes();

  await ctrl.create(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(capturedSaleCreate.totalAmount, 6300);
  assert.equal(capturedSaleCreate.profit, 1500);
  assert.equal(capturedSaleCreate.paymentMethod, "CASH");
  assert.equal(capturedSaleCreate.items.create[1].listedUnitPrice, 3200);
  assert.equal(capturedSaleCreate.items.create[1].unitPrice, 3500);
  assert.equal(capturedSaleCreate.items.create[0].listedUnitPrice, 1400);
  assert.equal(capturedSaleCreate.items.create[0].unitPrice, 1400);
  assert.equal(capturedSaleCreate.createdByStaffId, "cashier-1");
  assert.equal(capturedSaleCreate.receiptNumber, 41);
  assert.equal(stockUpdates, 2);
  assert.equal(stockMovements, 2);
});

test("sale price adjustments are rejected for retail and wholesale when the owner setting is off", async () => {
  let transactionStarted = false;
  const prismaMock = {
    shop: { findUnique: async () => ({ allowVariableSalePrices: false }) },
    product: { findMany: async () => [{ id: "eggs", name: "Egg tray", unit: "tray", currentStock: 4, sellingPrice: 12000, wholesalePrice: 11000, buyingPrice: 8500, doesNotExpire: true }] },
    $transaction: async () => { transactionStarted = true; },
  };
  const ctrl = loadController(prismaMock);
  for (const [saleMode, unitPrice] of [["RETAIL", 12500], ["WHOLESALE", 10500]]) {
    const res = createRes();
    await ctrl.create({ user: { userId: "owner-1", role: "MERCHANT" }, body: { saleMode, items: [{ productId: "eggs", quantity: 1, unitPrice }] } }, res);
    assert.equal(res.statusCode, 403);
    assert.match(res.payload.error, /off for this business/);
  }
  assert.equal(transactionStarted, false);
});

test("sale create blocks an expired product before opening a transaction", async () => {
  let transactionStarted = false;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1", allowVariableSalePrices: false }) },
    product: {
      findMany: async () => [{
        id: "prod-1",
        name: "Expired milk",
        unit: "pcs",
        currentStock: 2,
        sellingPrice: 2000,
        buyingPrice: 1500,
        doesNotExpire: false,
        expiryDate: new Date("2020-01-01T00:00:00.000Z"),
      }],
    },
    $transaction: async () => { transactionStarted = true; },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.create({ user: { userId: "user-1" }, body: { items: [{ productId: "prod-1", quantity: 1 }] } }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /expired/);
  assert.equal(transactionStarted, false);
});
