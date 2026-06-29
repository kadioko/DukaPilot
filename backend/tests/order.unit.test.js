const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/order.controller.js");

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

test("supplier order create rejects products outside the merchant shop", async () => {
  let productWhere;

  const prismaMock = {
    shop: {
      findUnique: async () => ({ id: "shop-1", name: "Duka la Amina" }),
    },
    supplier: {
      findUnique: async () => ({ id: "supplier-1", name: "Jumla Traders" }),
    },
    product: {
      findMany: async ({ where }) => {
        productWhere = where;
        return [];
      },
    },
  };

  const ctrl = loadController(prismaMock);
  const req = {
    user: { userId: "user-1" },
    body: {
      supplierId: "supplier-1",
      items: [{ productId: "other-shop-product", quantity: 2 }],
    },
  };
  const res = createRes();

  await ctrl.create(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, "One or more products not found in this shop");
  assert.equal(productWhere.shopId, "shop-1");
  assert.equal(productWhere.isActive, true);
});
