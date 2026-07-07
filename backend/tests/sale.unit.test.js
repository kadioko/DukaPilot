const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
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
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: prismaMock,
  };
  return require(controllerPath);
}

test("sale create rejects insufficient stock", async () => {
  const prismaMock = {
    shop: {
      findUnique: async () => ({ id: "shop-1" }),
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

test("sale create calculates total and profit before persisting transaction", async () => {
  let capturedSaleCreate;
  let stockUpdates = 0;
  let stockMovements = 0;

  const tx = {
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
    stockMovement: {
      create: async () => {
        stockMovements += 1;
      },
    },
  };

  const prismaMock = {
    shop: {
      findUnique: async () => ({ id: "shop-1" }),
    },
    product: {
      findMany: async () => [
        { id: "prod-1", name: "Soap", unit: "pcs", currentStock: 8, sellingPrice: 1500, buyingPrice: 1000 },
        { id: "prod-2", name: "Sugar", unit: "kg", currentStock: 4, sellingPrice: 3200, buyingPrice: 2800 },
      ],
    },
    $transaction: async (fn) => fn(tx),
  };

  const ctrl = loadController(prismaMock);
  const req = {
    user: { userId: "user-1" },
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
  assert.equal(capturedSaleCreate.totalAmount, 6500);
  assert.equal(capturedSaleCreate.profit, 1700);
  assert.equal(capturedSaleCreate.paymentMethod, "CASH");
  assert.equal(stockUpdates, 2);
  assert.equal(stockMovements, 2);
});
