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

test("pending supplier order edits replace items only within the merchant shop", async () => {
  let updateData;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1", name: "Duka la Amina" }) },
    order: {
      findFirst: async () => ({ id: "order-1", status: "PENDING" }),
      update: async ({ data }) => {
        updateData = data;
        return { id: "order-1", ...data, supplier: { id: "supplier-1", name: "Jumla Traders", phone: "+255700000001" }, items: [] };
      },
    },
    supplier: { findUnique: async () => ({ id: "supplier-1" }) },
    product: { findMany: async () => [{ id: "product-1", buyingPrice: 4500 }] },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.update({ user: { userId: "user-1" }, params: { id: "order-1" }, body: { supplierId: "supplier-1", items: [{ productId: "product-1", quantity: 3 }], note: "Friday delivery" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(updateData.totalAmount, 13500);
  assert.deepEqual(updateData.items.deleteMany, {});
  assert.deepEqual(updateData.items.create, [{ productId: "product-1", quantity: 3, unitPrice: 4500 }]);
});

test("pending and cancelled supplier orders can be deleted, while confirmed orders remain protected", async () => {
  let deleted = false;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1", name: "Duka la Amina" }) },
    order: {
      findFirst: async () => ({ id: "order-1", status: "CONFIRMED" }),
      delete: async () => { deleted = true; },
    },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.remove({ user: { userId: "user-1" }, params: { id: "order-1" } }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(deleted, false);

  prismaMock.order.findFirst = async () => ({ id: "order-2", status: "CANCELLED" });
  const cancelledRes = createRes();
  await ctrl.remove({ user: { userId: "user-1" }, params: { id: "order-2" } }, cancelledRes);

  assert.equal(cancelledRes.statusCode, 200);
  assert.equal(deleted, true);
});
