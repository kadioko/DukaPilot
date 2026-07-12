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
