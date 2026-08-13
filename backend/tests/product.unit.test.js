const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/product.controller.js");

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
  delete require.cache[path.resolve(__dirname, "../src/lib/shopAccess.js")];
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: prismaMock,
  };
  return require(controllerPath);
}

test("product list returns paginated results", async () => {
  const prismaMock = {
    shop: {
      findUnique: async () => ({ id: "shop-1" }),
    },
    product: {
      findMany: async () => [{ id: "prod-2", name: "Beans", currentStock: 7, minimumStock: 5 }],
      count: async () => 3,
    },
  };

  const ctrl = loadController(prismaMock);
  const req = {
    user: { userId: "user-1" },
    query: { page: "2", limit: "1", search: "bea" },
  };
  const res = createRes();

  await ctrl.list(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.pagination.page, 2);
  assert.equal(res.payload.pagination.limit, 1);
  assert.equal(res.payload.pagination.total, 3);
  assert.equal(res.payload.products.length, 1);
});

test("getLowStock filters products in JavaScript using minimumStock", async () => {
  const prismaMock = {
    shop: {
      findUnique: async () => ({ id: "shop-1" }),
    },
    product: {
      findMany: async () => [
        { id: "prod-1", name: "Rice", currentStock: 2, minimumStock: 5 },
        { id: "prod-2", name: "Sugar", currentStock: 8, minimumStock: 5 },
        { id: "prod-3", name: "Salt", currentStock: 0, minimumStock: 1 },
      ],
    },
  };

  const ctrl = loadController(prismaMock);
  const req = { user: { userId: "user-1" } };
  const res = createRes();

  await ctrl.getLowStock(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    res.payload.products.map((item) => item.id),
    ["prod-1", "prod-3"],
  );
});

test("product creation commits opening stock and stock movement together", async () => {
  const movements = [];
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $transaction: async (work) => work({
      product: { create: async ({ data }) => ({ id: "prod-1", ...data, supplier: null }) },
      stockMovement: { create: async ({ data }) => movements.push(data) },
    }),
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.create({ user: { userId: "user-1" }, body: { name: "Rice", buyingPrice: 2000, sellingPrice: 3000, currentStock: 12, minimumStock: 0 } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.product.currentStock, 12);
  assert.equal(res.payload.product.minimumStock, 0);
  assert.deepEqual(movements, [{ type: "IN", quantity: 12, note: "Initial stock", productId: "prod-1" }]);
});

test("product update rejects direct currentStock changes and names the supported endpoint", async () => {
  let updateCalled = false;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: {
      findFirst: async () => ({ id: "prod-1", shopId: "shop-1", currentStock: 5 }),
      update: async () => { updateCalled = true; },
    },
  };
  const ctrl = loadController(prismaMock);
  const req = {
    user: { userId: "user-1" },
    params: { id: "prod-1" },
    headers: { "x-dukapilot-language": "sw" },
    body: { currentStock: 12 },
  };
  const res = createRes();

  await ctrl.update(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.code, "STOCK_ADJUSTMENT_REQUIRED");
  assert.equal(res.payload.supportedEndpoint, "POST /api/stock/adjust");
  assert.match(res.payload.error, /Stock haiwezi/);
  assert.equal(updateCalled, false);
});

test("product update accepts unchanged legacy currentStock while changing product details", async () => {
  let updated;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: {
      findFirst: async () => ({ id: "prod-1", shopId: "shop-1", name: "Rice", currentStock: 5, sellingPrice: 3000, wholesalePrice: null }),
      update: async ({ data }) => {
        updated = data;
        return { id: "prod-1", name: data.name, buyingPrice: data.buyingPrice, currentStock: 5, supplier: null };
      },
    },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.update({
    user: { userId: "user-1" },
    params: { id: "prod-1" },
    body: { name: "Premium Rice", buyingPrice: 2400, currentStock: 5 },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(updated.name, "Premium Rice");
  assert.equal(updated.buyingPrice, 2400);
  assert.equal(res.payload.product.currentStock, 5);
});

test("CSV import creates products and an opening stock movement for each stocked item", async () => {
  const movements = [];
  const created = [];
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: { findMany: async () => [] },
    $transaction: async (work) => work({
      product: {
        create: async ({ data }) => {
          created.push(data);
          return { id: `prod-${created.length}`, ...data, supplier: null };
        },
      },
      stockMovement: { create: async ({ data }) => movements.push(data) },
    }),
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.importCsv({
    user: { userId: "user-1" },
    body: { csv: "name,buyingPrice,sellingPrice,currentStock\nRice,2000,3000,8\nSalt,500,700,0" },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.count, 2);
  assert.equal(created[0].currentStock, 8);
  assert.deepEqual(movements, [{ type: "IN", quantity: 8, note: "Opening stock from CSV import", productId: "prod-1" }]);
});

test("CSV import keeps wholesale off by default and enables it only when explicitly requested", async () => {
  const created = [];
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: { findMany: async () => [] },
    $transaction: async (work) => work({
      product: { create: async ({ data }) => { created.push(data); return { id: `prod-${created.length}`, ...data, supplier: null }; } },
      stockMovement: { create: async () => {} },
    }),
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.importCsv({
    user: { userId: "user-1" },
    body: { csv: "name,buyingPrice,sellingPrice,wholesaleEnabled,wholesalePrice,wholesaleMinQty\nRice,2000,3000,,,\nBeans,1500,2400,true,2000," },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(created[0].wholesalePrice, null);
  assert.equal(created[0].wholesaleMinQty, null);
  assert.equal(created[1].wholesalePrice, 2000);
  assert.equal(created[1].wholesaleMinQty, 5);
});

test("CSV import rejects a wholesale price until wholesale is explicitly enabled", async () => {
  const prismaMock = { shop: { findUnique: async () => ({ id: "shop-1" }) } };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.importCsv({
    user: { userId: "user-1" },
    body: { csv: "name,buyingPrice,sellingPrice,wholesaleEnabled,wholesalePrice\nRice,2000,3000,false,2500" },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.details[0].field, "wholesaleEnabled");
});

test("CSV import rejects blank required prices before writing anything", async () => {
  const prismaMock = { shop: { findUnique: async () => ({ id: "shop-1" }) } };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.importCsv({
    user: { userId: "user-1" },
    body: { csv: "name,buyingPrice,sellingPrice\nRice,,3000" },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.code, "PRODUCT_CSV_INVALID");
  assert.equal(res.payload.details[0].field, "buyingPrice");
});

test("CSV import accepts whole TZS amounts formatted with commas or spaces", async () => {
  const created = [];
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    product: { findMany: async () => [] },
    $transaction: async (work) => work({
      product: { create: async ({ data }) => { created.push(data); return { id: `prod-${created.length}`, ...data, supplier: null }; } },
      stockMovement: { create: async () => {} },
    }),
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.importCsv({
    user: { userId: "user-1" },
    body: { csv: "name,buyingPrice,sellingPrice,wholesaleEnabled,wholesalePrice\nBrake pad,\"1,600\",\"3 000\",true,TZS 2300" },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(created[0].buyingPrice, 1600);
  assert.equal(created[0].sellingPrice, 3000);
  assert.equal(created[0].wholesalePrice, 2300);
});

test("CSV import rejects malformed grouped TZS amounts", async () => {
  const prismaMock = { shop: { findUnique: async () => ({ id: "shop-1" }) } };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.importCsv({
    user: { userId: "user-1" },
    body: { csv: "name,buyingPrice,sellingPrice\nRice,\"1,23,4\",3000" },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.details[0].field, "buyingPrice");
});
