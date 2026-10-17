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
    supplierPayment: { groupBy: async ({ where }) => where.kind === "REFUND" ? [{ cashSessionId: "session-11", _sum: { amount: -500 }, _count: { id: 1 } }] : [{ cashSessionId: "session-11", _sum: { amount: 1000 }, _count: { id: 1 } }] },
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
  assert.equal(res.payload.sessions[0].summary.expectedCash, 59500);
  assert.equal(res.payload.sessions[0].summary.supplierCashOut, 1000);
  assert.equal(res.payload.sessions[0].summary.supplierRefundsReceived, 500);
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

test("a manager with team-shift permission sees every active shop drawer", async () => {
  let findManyArgs;
  const prismaMock = {
    cashSession: {
      findFirst: async () => null,
      findMany: async (args) => {
        findManyArgs = args;
        return [{ id: "cashier-session", shopId: "shop-1", status: "OPEN", openingCash: 10000, openedById: "staff:staff-4", openedByName: "Asha", openedAt: new Date("2026-09-15T06:00:00Z") }];
      },
    },
    sale: { groupBy: async () => [] },
    debtPayment: { groupBy: async () => [] },
    quotationPayment: { groupBy: async () => [] },
    expense: { groupBy: async () => [] },
  };
  const controller = loadController(prismaMock);
  const res = response();

  await controller.current({ user: { userId: "manager-user", staffId: "staff-manager", role: "MERCHANT", permissions: { canManageCashSessions: true } } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.canManageAllSessions, true);
  assert.equal(res.payload.canOpenOwnSession, false);
  assert.equal(findManyArgs.where.shopId, "shop-1");
  assert.equal(findManyArgs.where.openedById, undefined);
  assert.equal(res.payload.sessions[0].openedByName, "Asha");
});

test("daily close counts cash stock receipts and direct cooking costs once as cash-out", async () => {
  const prismaMock = {
    sale: { aggregate: async () => ({ _sum: { totalAmount: 50000 }, _count: { id: 2 } }) },
    debtPayment: { aggregate: async () => ({ _sum: { amount: 10000 }, _count: { id: 1 } }) },
    quotationPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    expense: { aggregate: async () => ({ _sum: { amount: 5000 }, _count: { id: 1 } }) },
    stockReceipt: { aggregate: async () => ({ _sum: { paidAtReceipt: 240000 }, _count: { id: 2 } }) },
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

test("cash recovered from a corrected customer return is a separately dated drawer inflow", async () => {
  const prismaMock = {
    sale: { aggregate: async () => ({ _sum: { totalAmount: 2000 }, _count: { id: 1 } }) },
    debtPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    quotationPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    saleReturn: { aggregate: async () => ({ _sum: { refundAmount: 1000 }, _count: { id: 1 } }) },
    saleReturnReversal: { aggregate: async () => ({ _sum: { refundRecoveredAmount: 1000 }, _count: { id: 1 } }) },
    expense: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
  };
  const controller = loadController(prismaMock);
  const summary = await controller.summarizeSession(prismaMock, { id: "session-correction", openingCash: 0 });

  assert.equal(summary.cashRefunds, 1000);
  assert.equal(summary.cashRefundRecoveries, 1000);
  assert.equal(summary.cashRefundRecoveryCount, 1);
  assert.equal(summary.expectedCash, 2000);
});

test("daily close counts only receipt-time cash paid plus later cash supplier settlements", async () => {
  const prismaMock = {
    sale: { aggregate: async () => ({ _sum: { totalAmount: 0 }, _count: { id: 0 } }) },
    debtPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    quotationPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    expense: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    stockReceipt: { aggregate: async () => ({ _sum: { paidAtReceipt: 2000 }, _count: { id: 1 } }) },
    supplierPayment: { aggregate: async ({ where }) => ({ _sum: { amount: where.kind === "REFUND" ? -700 : 1500 }, _count: { id: where.kind === "REFUND" ? 1 : 1 } }) },
  };
  const controller = loadController(prismaMock);
  const summary = await controller.summarizeSession(prismaMock, { id: "session-1", openingCash: 10000 });

  assert.equal(summary.inventoryCashOut, 2000);
  assert.equal(summary.supplierCashOut, 1500);
  assert.equal(summary.supplierRefundsReceived, 700);
  assert.equal(summary.supplierRefundCount, 1);
  assert.equal(summary.expectedCash, 7200);
});

test("daily close shows receipt-payment corrections separately and applies their signed cash effect", async () => {
  const prismaMock = {
    sale: { aggregate: async () => ({ _sum: { totalAmount: 0 }, _count: { id: 0 } }) },
    debtPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    quotationPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    expense: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    stockReceipt: { aggregate: async () => ({ _sum: { paidAtReceipt: 5000 }, _count: { id: 1 } }) },
    stockReceiptPaymentCorrection: { aggregate: async () => ({ _sum: { cashOutAdjustment: -1000 }, _count: { id: 1 } }) },
  };
  const controller = loadController(prismaMock);
  const summary = await controller.summarizeSession(prismaMock, { id: "session-correction", openingCash: 10000 });

  assert.equal(summary.inventoryCashOut, 5000);
  assert.equal(summary.receiptPaymentCorrectionCashOut, -1000);
  assert.equal(summary.receiptPaymentCorrectionCount, 1);
  assert.equal(summary.expectedCash, 6000);
});

test("daily close counts direct farm production cost once as cash-out", async () => {
  const prismaMock = {
    sale: { aggregate: async () => ({ _sum: { totalAmount: 50000 }, _count: { id: 2 } }) },
    debtPayment: { aggregate: async () => ({ _sum: { amount: 10000 }, _count: { id: 1 } }) },
    quotationPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    expense: { aggregate: async () => ({ _sum: { amount: 5000 }, _count: { id: 1 } }) },
    stockReceipt: { aggregate: async () => ({ _sum: { paidAtReceipt: 240000 }, _count: { id: 2 } }) },
    foodPreparationBatch: { aggregate: async () => ({ _sum: { additionalCost: 12000 }, _count: { id: 1 } }) },
    farmProductionBatch: { aggregate: async () => ({ _sum: { additionalCost: 3000 }, _count: { id: 1 } }) },
  };
  const controller = loadController(prismaMock);
  const summary = await controller.summarizeSession(prismaMock, { id: "session-1", openingCash: 300000 });

  assert.equal(summary.farmCashOut, 3000);
  assert.equal(summary.farmProductionCostCount, 1);
  assert.equal(summary.expectedCash, 100000);
});

test("daily close counts direct cash crop inputs once as a cash-out", async () => {
  const prismaMock = {
    sale: { aggregate: async () => ({ _sum: { totalAmount: 50000 }, _count: { id: 2 } }) },
    debtPayment: { aggregate: async () => ({ _sum: { amount: 10000 }, _count: { id: 1 } }) },
    quotationPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    expense: { aggregate: async () => ({ _sum: { amount: 5000 }, _count: { id: 1 } }) },
    cropInputUsage: { aggregate: async () => ({ _sum: { totalCost: 7000 }, _count: { id: 1 } }) },
  };
  const controller = loadController(prismaMock);
  const summary = await controller.summarizeSession(prismaMock, { id: "session-1", openingCash: 20000 });

  assert.equal(summary.cropCashOut, 7000);
  assert.equal(summary.cropInputCostCount, 1);
  assert.equal(summary.expectedCash, 68000);
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
