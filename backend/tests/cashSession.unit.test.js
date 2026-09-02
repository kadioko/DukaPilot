const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/cashSession.controller.js");

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; } };
}

function loadController(prismaMock) {
  delete require.cache[controllerPath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
  require.cache[shopAccessPath] = { id: shopAccessPath, filename: shopAccessPath, loaded: true, exports: { getShopIdForUser: async () => "shop-1" } };
  return require(controllerPath);
}

test("daily-close history is paginated, filters closed sessions, and decorates only the current page", async () => {
  let findManyArgs;
  let countArgs;
  const prismaMock = {
    cashSession: {
      findMany: async (args) => {
        findManyArgs = args;
        return [{ id: "session-11", shopId: "shop-1", status: "CLOSED", openingCash: 10000, openedByName: "Asha", openedAt: new Date("2026-08-11T06:00:00Z"), closedAt: new Date("2026-08-11T15:00:00Z"), countedCash: 60000, variance: 0 }];
      },
      count: async (args) => { countArgs = args; return 23; },
    },
    sale: { groupBy: async () => [{ cashSessionId: "session-11", _sum: { totalAmount: 50000 }, _count: { id: 4 } }] },
    debtPayment: { groupBy: async () => [] },
    quotationPayment: { groupBy: async () => [] },
    expense: { groupBy: async () => [] },
  };
  const controller = loadController(prismaMock);
  const res = response();

  await controller.history({ user: { userId: "owner-1", role: "MERCHANT" }, query: { page: "2", limit: "10", status: "CLOSED", from: "2026-08-01", to: "2026-08-31", search: "ash" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(findManyArgs.skip, 10);
  assert.equal(findManyArgs.take, 10);
  assert.equal(findManyArgs.where.status, "CLOSED");
  assert.equal(findManyArgs.where.openedByName.contains, "ash");
  assert.equal(findManyArgs.where.closedAt.gte.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(findManyArgs.where.closedAt.lt.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.deepEqual(countArgs.where, findManyArgs.where);
  assert.equal(res.payload.pagination.totalPages, 3);
  assert.equal(res.payload.sessions[0].summary.expectedCash, 60000);
});

test("staff daily-close history remains scoped to that staff member", async () => {
  let findManyArgs;
  const prismaMock = {
    cashSession: { findMany: async (args) => { findManyArgs = args; return []; }, count: async () => 0 },
    sale: { groupBy: async () => [] },
    debtPayment: { groupBy: async () => [] },
    quotationPayment: { groupBy: async () => [] },
    expense: { groupBy: async () => [] },
  };
  const controller = loadController(prismaMock);
  const res = response();

  await controller.history({ user: { userId: "staff-user", staffId: "staff-4", role: "MERCHANT" }, query: {} }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(findManyArgs.where.shopId, "shop-1");
  assert.equal(findManyArgs.where.openedById, "staff:staff-4");
  assert.equal(findManyArgs.where.status, "CLOSED");
});

test("daily close counts cash stock receipts and direct cooking costs once as cash-out", async () => {
  const prismaMock = {
    sale: { aggregate: async () => ({ _sum: { totalAmount: 50000 }, _count: { id: 2 } }) },
    debtPayment: { aggregate: async () => ({ _sum: { amount: 10000 }, _count: { id: 1 } }) },
    quotationPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    expense: { aggregate: async () => ({ _sum: { amount: 5000 }, _count: { id: 1 } }) },
    stockReceipt: { aggregate: async () => ({ _sum: { totalLandedCost: 240000 }, _count: { id: 2 } }) },
    foodPreparationBatch: { aggregate: async () => ({ _sum: { additionalCost: 12000 }, _count: { id: 1 } }) },
  };
  const controller = loadController(prismaMock);

  const summary = await controller.summarizeSession(prismaMock, { id: "session-1", openingCash: 300000 });

  assert.equal(summary.inventoryCashOut, 240000);
  assert.equal(summary.cookingCashOut, 12000);
  assert.equal(summary.stockReceiptCount, 2);
  assert.equal(summary.cookingCostCount, 1);
  assert.equal(summary.expectedCash, 103000);
});

test("daily close counts direct farm production cost once as cash-out", async () => {
  const prismaMock = {
    sale: { aggregate: async () => ({ _sum: { totalAmount: 50000 }, _count: { id: 2 } }) },
    debtPayment: { aggregate: async () => ({ _sum: { amount: 10000 }, _count: { id: 1 } }) },
    quotationPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    expense: { aggregate: async () => ({ _sum: { amount: 5000 }, _count: { id: 1 } }) },
    stockReceipt: { aggregate: async () => ({ _sum: { totalLandedCost: 240000 }, _count: { id: 2 } }) },
    foodPreparationBatch: { aggregate: async () => ({ _sum: { additionalCost: 12000 }, _count: { id: 1 } }) },
    farmProductionBatch: { aggregate: async () => ({ _sum: { additionalCost: 3000 }, _count: { id: 1 } }) },
  };
  const controller = loadController(prismaMock);
  const summary = await controller.summarizeSession(prismaMock, { id: "session-1", openingCash: 300000 });

  assert.equal(summary.farmCashOut, 3000);
  assert.equal(summary.farmProductionCostCount, 1);
  assert.equal(summary.expectedCash, 100000);
});

test("daily close excludes a legacy converted quotation sale when its cash payment is already recorded", () => {
  const controller = loadController({});
  const where = controller.cashSaleWhere("session-1");

  assert.equal(where.cashSessionId, "session-1");
  assert.equal(where.paymentMethod, "CASH");
  assert.deepEqual(where.NOT.quotation.is.payments.some, {
    kind: "PAYMENT",
    paymentMethod: "CASH",
    debtPaymentId: null,
  });
});
