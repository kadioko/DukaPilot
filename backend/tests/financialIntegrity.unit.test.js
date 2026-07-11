const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const saleControllerPath = path.resolve(__dirname, "../src/controllers/sale.controller.js");
const debtControllerPath = path.resolve(__dirname, "../src/controllers/debt.controller.js");
const supplierControllerPath = path.resolve(__dirname, "../src/controllers/supplier.controller.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function mockPrisma(prismaMock) {
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
}

test("sale retry returns the original sale before touching stock", async () => {
  let productsRead = false;
  mockPrisma({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    sale: {
      findFirst: async () => ({ id: "sale-1", clientReference: "phone-sale-1", items: [] }),
    },
    product: { findMany: async () => { productsRead = true; return []; } },
  });
  delete require.cache[shopAccessPath];
  delete require.cache[saleControllerPath];
  const controller = require(saleControllerPath);
  const res = response();

  await controller.create({ user: { userId: "owner-1" }, body: { clientReference: "phone-sale-1", items: [{ productId: "p-1", quantity: 1 }] } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.reused, true);
  assert.equal(res.payload.sale.id, "sale-1");
  assert.equal(productsRead, false);
});

test("debt payment rejects an overpayment and does not create a ledger entry", async () => {
  let createdPayments = 0;
  mockPrisma({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $transaction: async (fn) => fn({
      debt: { findFirst: async () => ({ id: "debt-1", shopId: "shop-1", amount: 1000, amountPaid: 800, status: "PARTIAL" }) },
      debtPayment: { create: async () => { createdPayments += 1; } },
    }),
  });
  delete require.cache[shopAccessPath];
  delete require.cache[debtControllerPath];
  const controller = require(debtControllerPath);
  const res = response();
  let error;

  await controller.recordPayment({ user: { userId: "owner-1" }, params: { id: "debt-1" }, body: { amount: 300 } }, res, (nextError) => { error = nextError; });

  assert.equal(error.status, 400);
  assert.match(error.message, /exceeds the remaining balance/);
  assert.equal(createdPayments, 0);
});

test("merchant cannot edit a supplier created by another shop", async () => {
  mockPrisma({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    supplier: { findUnique: async () => ({ id: "supplier-1", createdByShopId: "shop-2" }) },
  });
  delete require.cache[shopAccessPath];
  delete require.cache[supplierControllerPath];
  const controller = require(supplierControllerPath);
  const res = response();

  await controller.update({ user: { userId: "owner-1", role: "MERCHANT" }, params: { id: "supplier-1" }, body: { name: "Changed" } }, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.payload.error, /Only the shop that added this supplier/);
});
