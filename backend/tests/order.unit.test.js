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
      findFirst: async () => ({ id: "supplier-1", name: "Jumla Traders" }),
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

test("supplier order saves a normalized invoice reference for matching during receiving", async () => {
  let createdData;
  const ctrl = loadController({
    shop: { findUnique: async () => ({ id: "shop-1", name: "Duka la Amina" }) },
    supplier: { findFirst: async () => ({ id: "supplier-1" }) },
    product: { findMany: async () => [{ id: "product-1", buyingPrice: 3000 }] },
    order: { create: async ({ data }) => { createdData = data; return { id: "order-1", ...data, supplier: {}, items: [] }; } },
  });
  const res = createRes();

  await ctrl.create({ user: { userId: "user-1" }, body: { supplierId: "supplier-1", invoiceNumber: "  inv-04/ab ", items: [{ productId: "product-1", quantity: 2 }] } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(createdData.invoiceNumber, "INV-04/AB");
});

test("invoice matching is scoped to the active shop, supplier, and all receivable order statuses", async () => {
  let query;
  const ctrl = loadController({
    shop: { findUnique: async () => ({ id: "branch-2", name: "Branch" }) },
    supplier: { findFirst: async ({ where }) => { assert.deepEqual(where, { id: "supplier-1", OR: [{ createdByShopId: null }, { createdByShopId: "branch-2" }] }); return { id: "supplier-1" }; } },
    order: { findMany: async (args) => { query = args; return []; } },
  });
  const res = createRes();

  await ctrl.matchByInvoice({ user: { userId: "owner-1", resolvedShopId: "branch-2" }, query: { supplierId: "supplier-1", invoiceNumber: " inv-22 " } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(query.where, {
    shopId: "branch-2",
    supplierId: "supplier-1",
    invoiceNumber: { equals: "INV-22", mode: "insensitive" },
    status: { in: ["PENDING", "CONFIRMED", "OUT_FOR_DELIVERY", "PARTIALLY_RECEIVED"] },
  });
});

test("merchant tracking status updates lock the shop order and cannot fake receipt completion", async () => {
  let lockCalled = false;
  let updatedStatus;
  const tx = {
    $queryRawUnsafe: async (query, id, shopId) => {
      assert.match(query, /FROM "orders" WHERE "id" = \$1 AND "shopId" = \$2 FOR UPDATE/);
      assert.deepEqual([id, shopId], ["order-1", "shop-1"]);
      lockCalled = true;
    },
    order: {
      findFirst: async () => { assert.equal(lockCalled, true); return { id: "order-1", status: "PENDING" }; },
      update: async ({ data }) => { updatedStatus = data.status; return { id: "order-1", status: data.status }; },
    },
  };
  const ctrl = loadController({ shop: { findUnique: async () => ({ id: "shop-1" }) }, $transaction: (callback) => callback(tx) });
  const req = { user: { userId: "user-1" }, params: { id: "order-1" }, body: { status: "OUT_FOR_DELIVERY" } };
  const res = createRes();

  await ctrl.updateTrackingStatus(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(updatedStatus, "OUT_FOR_DELIVERY");
  assert.deepEqual(req.audit.metadata, { from: "PENDING", to: "OUT_FOR_DELIVERY" });

  tx.order.findFirst = async () => ({ id: "order-1", status: "PARTIALLY_RECEIVED" });
  const closedRes = createRes();
  await ctrl.updateTrackingStatus({ ...req, body: { status: "CONFIRMED" } }, closedRes);
  assert.equal(closedRes.statusCode, 409);
  assert.equal(updatedStatus, "OUT_FOR_DELIVERY");
});

test("supplier tracking status cannot move backwards", async () => {
  const tx = {
    $queryRawUnsafe: async () => [],
    order: {
      findFirst: async () => ({ id: "order-1", status: "OUT_FOR_DELIVERY" }),
      update: async () => assert.fail("backward status must not be written"),
    },
  };
  const ctrl = loadController({ shop: { findUnique: async () => ({ id: "shop-1" }) }, $transaction: (callback) => callback(tx) });
  const res = createRes();

  await ctrl.updateTrackingStatus({ user: { userId: "user-1" }, params: { id: "order-1" }, body: { status: "CONFIRMED" } }, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.payload.error, /cannot move backwards/i);
});

test("pending supplier order edits replace items only within the merchant shop", async () => {
  let updateData;
  let lockAcquired = false;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1", name: "Duka la Amina" }) },
    $transaction: async (callback) => callback({
      $queryRawUnsafe: async () => { lockAcquired = true; },
      order: {
        findFirst: async () => ({ id: "order-1", status: "PENDING" }),
        update: async ({ data }) => {
          assert.equal(lockAcquired, true);
          updateData = data;
          return { id: "order-1", ...data, supplier: { id: "supplier-1", name: "Jumla Traders", phone: "+255700000001" }, items: [] };
        },
      },
    }),
    supplier: { findFirst: async () => ({ id: "supplier-1" }) },
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

test("order cancellation locks the same tenant-scoped row used by stock receiving and rechecks status", async () => {
  let lockAcquired = false;
  let updateCalled = false;
  const tx = {
    $queryRawUnsafe: async (query, orderId, shopId) => {
      assert.match(query, /FROM "orders" WHERE "id" = \$1 AND "shopId" = \$2 FOR UPDATE/);
      assert.deepEqual([orderId, shopId], ["order-1", "shop-1"]);
      lockAcquired = true;
      return [];
    },
    order: {
      findFirst: async () => {
        assert.equal(lockAcquired, true);
        return { id: "order-1", status: "DELIVERED" };
      },
      updateMany: async () => { updateCalled = true; return { count: 1 }; },
    },
  };
  const ctrl = loadController({
    shop: { findUnique: async () => ({ id: "shop-1", name: "Duka la Amina" }) },
    $transaction: (callback) => callback(tx),
  });
  const res = createRes();

  await ctrl.cancel({ user: { userId: "user-1" }, params: { id: "order-1" } }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /DELIVERED/);
  assert.equal(updateCalled, false);
});

test("order cancellation uses a guarded transactional update for a still-cancellable order", async () => {
  let findCalls = 0;
  let updateWhere;
  const tx = {
    $queryRawUnsafe: async () => [],
    order: {
      findFirst: async () => ({ id: "order-1", status: ++findCalls === 1 ? "PARTIALLY_RECEIVED" : "CANCELLED" }),
      updateMany: async ({ where, data }) => {
        updateWhere = where;
        assert.equal(data.status, "CANCELLED");
        return { count: 1 };
      },
    },
  };
  const ctrl = loadController({
    shop: { findUnique: async () => ({ id: "shop-1", name: "Duka la Amina" }) },
    $transaction: (callback) => callback(tx),
  });
  const res = createRes();

  await ctrl.cancel({ user: { userId: "user-1" }, params: { id: "order-1" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.order.status, "CANCELLED");
  assert.deepEqual(updateWhere.status.notIn, ["DELIVERED", "CANCELLED"]);
  assert.equal(updateWhere.shopId, "shop-1");
});

test("supplier order create rejects a supplier private to another shop", async () => {
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1", name: "Duka la Amina" }) },
    supplier: { findFirst: async () => null },
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.create({ user: { userId: "user-1" }, body: { supplierId: "private-supplier", items: [{ productId: "product-1", quantity: 1 }] } }, res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.payload.error, "Supplier not found");
});

test("orders with receipt history cannot be deleted, while empty pending/cancelled orders can", async () => {
  let deleted = false;
  let receiptCount = 0;
  let lockAcquired = false;
  let orderStatus = "CONFIRMED";
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1", name: "Duka la Amina" }) },
    $transaction: (callback) => callback({
      $queryRawUnsafe: async (query, orderId, shopId) => {
        assert.match(query, /FROM "orders" WHERE "id" = \$1 AND "shopId" = \$2 FOR UPDATE/);
        assert.match(orderId, /^order-[123]$/);
        assert.equal(shopId, "shop-1");
        lockAcquired = true;
      },
      stockReceipt: { count: async () => { assert.equal(lockAcquired, true); return receiptCount; } },
      order: {
        findFirst: async ({ where }) => ({ id: where.id, status: orderStatus }),
        delete: async () => { deleted = true; },
      },
    }),
  };
  const ctrl = loadController(prismaMock);
  const res = createRes();

  await ctrl.remove({ user: { userId: "user-1" }, params: { id: "order-1" } }, res);

  assert.equal(res.statusCode, 409);
  assert.equal(deleted, false);

  orderStatus = "CANCELLED";
  lockAcquired = false;
  const cancelledRes = createRes();
  await ctrl.remove({ user: { userId: "user-1" }, params: { id: "order-2" } }, cancelledRes);

  assert.equal(cancelledRes.statusCode, 200);
  assert.equal(deleted, true);

  deleted = false;
  receiptCount = 1;
  orderStatus = "PENDING";
  lockAcquired = false;
  const receivedOrderRes = createRes();
  await ctrl.remove({ user: { userId: "user-1" }, params: { id: "order-3" } }, receivedOrderRes);
  assert.equal(receivedOrderRes.statusCode, 409);
  assert.equal(deleted, false);
});
