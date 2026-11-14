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

function openSessionMock() {
  const sessions = [];
  const lockQueries = [];
  const tx = {
    $queryRawUnsafe: async (query) => { lockQueries.push(query); return []; },
    user: { findUnique: async () => ({ name: "Owner" }) },
    staffMember: { findFirst: async () => ({ name: "Cashier" }) },
    cashSession: {
      findFirst: async ({ where }) => where.openRequestId
        ? sessions.find((session) => session.openRequestId === where.openRequestId && session.openedById === where.openedById) || null
        : sessions.find((session) => session.shopId === where.shopId && session.status === "OPEN" && session.openedById === where.openedById) || null,
      create: async ({ data }) => {
        const session = { id: `session-${sessions.length + 1}`, status: "OPEN", openingCash: data.openingCash, note: data.note, openedById: data.openedById, openedByName: data.openedByName, shopId: data.shopId, openRequestId: data.openRequestId, openRequestHash: data.openRequestHash };
        sessions.push(session);
        return session;
      },
    },
  };
  const prismaMock = {
    $transaction: async (work) => work(tx),
    $queryRawUnsafe: async () => [{ amount: 0, count: 0 }],
    user: tx.user,
    staffMember: tx.staffMember,
    cashSession: tx.cashSession,
    sale: { aggregate: async () => ({ _sum: { totalAmount: 0 }, _count: { id: 0 } }) },
    debtPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    quotationPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    expense: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
  };
  return { prismaMock, sessions, lockQueries };
}

test("daily-close history is paginated, filters closed sessions, and decorates only the current page", async () => {
  let findManyArgs;
  let countArgs;
  const prismaMock = {
    cashSession: {
      findMany: async (args) => {
        findManyArgs = args;
        return [{ id: "session-11", shopId: "shop-1", status: "CLOSED", openingCash: 10000, openedByName: "Asha", openedAt: new Date("2026-08-11T06:00:00Z"), closedAt: new Date("2026-08-11T15:00:00Z"), countedCash: 60000, variance: 0, cashTransferredOut: 500, cashTransferDestination: "SAFE" }];
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
  assert.equal(res.payload.sessions[0].summary.expectedCash, 59000);
  assert.equal(res.payload.sessions[0].summary.cashTransferredOut, 500);
  assert.equal(res.payload.sessions[0].summary.supplierCashOut, 1000);
  assert.equal(res.payload.sessions[0].summary.supplierRefundsReceived, 500);
});

test("owner drawer transfer is removed before Daily Close variance and staff cannot enter it", async () => {
  let updatedData;
  let transactionCount = 0;
  const session = { id: "session-transfer", shopId: "shop-1", status: "OPEN", openingCash: 5000, openedById: "user:owner-1", openedByName: "Owner", openedAt: new Date(), cashTransferredOut: 0 };
  const tx = {
    $queryRawUnsafe: async (query) => query.includes("cash_sessions") ? [] : [{ amount: 0, count: 0 }],
    cashSession: {
      findFirst: async () => session,
      update: async ({ data }) => { updatedData = data; return { ...session, ...data }; },
    },
    sale: { aggregate: async () => ({ _sum: { totalAmount: 0 }, _count: { id: 0 } }) },
    debtPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    quotationPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
  };
  const prismaMock = { $transaction: async (fn) => { transactionCount += 1; return fn(tx); } };
  const controller = loadController(prismaMock);
  const denied = response();
  await controller.close({ user: { userId: "staff-1", staffId: "staff-1", role: "MERCHANT" }, params: { id: session.id }, body: { countedCash: 2800, cashTransferredOut: 2000, cashTransferDestination: "SAFE" } }, denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(transactionCount, 0);

  const allowed = response();
  await controller.close({ user: { userId: "owner-1", role: "MERCHANT" }, params: { id: session.id }, body: { countedCash: 2800, cashTransferredOut: 2000, cashTransferDestination: "SAFE" } }, allowed);
  assert.equal(updatedData.expectedCash, 3000);
  assert.equal(updatedData.variance, -200);
  assert.equal(updatedData.cashTransferredOut, 2000);
  assert.equal(updatedData.cashTransferDestination, "SAFE");
});

test("Daily Close records an external drawer transfer in automatic cash mode in the same transaction", async () => {
  const previousFlag = process.env.CASH_HOLDING_ENABLED;
  process.env.CASH_HOLDING_ENABLED = "true";
  const epoch = { id: "epoch-auto", shopId: "shop-1", mode: "AUTO", openedAt: new Date(Date.now() - 60_000), closedAt: null };
  const movements = [];
  const session = { id: "session-auto-transfer", shopId: "shop-1", status: "OPEN", openingCash: 5000, openedById: "user:owner-1", openedByName: "Owner", openedAt: new Date(Date.now() - 30_000), cashTransferredOut: 0 };
  const tx = {
    $queryRawUnsafe: async (query) => query.includes("cash_holding_epochs") ? [epoch] : query.includes("SELECT COALESCE(SUM(e.amount)") ? [{ amount: 0, count: 0 }] : [],
    cashSession: { findFirst: async () => session, update: async ({ data }) => Object.assign(session, data) },
    cashHoldingEpoch: {},
    cashHoldingMovement: {
      findFirst: async ({ where }) => movements.find((movement) => Object.entries(where).every(([key, value]) => movement[key] === value)) || null,
      create: async ({ data }) => { const movement = { id: `movement-${movements.length + 1}`, ...data }; movements.push(movement); return movement; },
    },
    sale: { aggregate: async () => ({ _sum: { totalAmount: 0 }, _count: { id: 0 } }) },
    debtPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
  };
  const prismaMock = { $transaction: async (work) => work(tx) };
  const controller = loadController(prismaMock);
  try {
    const res = response();
    await controller.close({ user: { userId: "owner-1", role: "MERCHANT" }, params: { id: session.id }, body: { countedCash: 2800, cashTransferredOut: 2000, cashTransferDestination: "BANK" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(session.expectedCash, 3000);
    assert.equal(movements.length, 1);
    assert.equal(movements[0].kind, "SOURCE_EVENT");
    assert.equal(movements[0].sourceType, "SHIFT_CASH_TRANSFER");
    assert.equal(movements[0].sourceId, session.id);
    assert.equal(movements[0].amount, -2000);
  } finally {
    if (previousFlag === undefined) delete process.env.CASH_HOLDING_ENABLED;
    else process.env.CASH_HOLDING_ENABLED = previousFlag;
  }
});

test("Daily Close excludes legacy future-dated expense rows even if their due date has arrived", async () => {
  let expenseQuery;
  const prismaMock = {
    sale: { aggregate: async () => ({ _sum: { totalAmount: 0 }, _count: { id: 0 } }) },
    debtPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    quotationPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    $queryRawUnsafe: async (query, ...params) => { expenseQuery = { query, params }; return [{ amount: 0, count: 0 }]; },
  };
  const controller = loadController(prismaMock);
  const summary = await controller.summarizeSession(prismaMock, {
    id: "session-icy", shopId: "shop-icy", status: "OPEN", openingCash: 0,
    openedAt: new Date("2026-10-28T06:00:00.000Z"),
  });
  assert.equal(summary.cashExpenses, 0);
  assert.ok(expenseQuery.query.includes("Africa/Dar_es_Salaam"));
  assert.ok(expenseQuery.query.includes('e."requiresDateReview"') && expenseQuery.query.includes("AT TIME ZONE 'UTC'"));
  assert.deepEqual(expenseQuery.params.slice(0, 2), ["session-icy", "shop-icy"]);
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

test("cash session detail verifies a lost close response without crossing staff or shop boundaries", async () => {
  let where;
  const session = { id: "session-11", shopId: "shop-1", openedById: "staff:staff-4", status: "CLOSED", openingCash: 0, countedCash: 1000 };
  const prismaMock = {
    cashSession: { findFirst: async (args) => { where = args.where; return args.where.openedById === "staff:staff-4" ? session : null; } },
    sale: { groupBy: async () => [] },
    debtPayment: { groupBy: async () => [] },
    quotationPayment: { groupBy: async () => [] },
    expense: { groupBy: async () => [] },
  };
  const controller = loadController(prismaMock);
  const allowed = response();
  await controller.get({ user: { userId: "staff-user", staffId: "staff-4", role: "MERCHANT" }, params: { id: "session-11" } }, allowed);
  assert.equal(allowed.payload.session.status, "CLOSED");
  assert.equal(allowed.payload.session.countedCash, 1000);
  assert.deepEqual(where, { id: "session-11", shopId: "shop-1", openedById: "staff:staff-4" });

  const denied = response();
  await controller.get({ user: { userId: "other-staff", staffId: "staff-5", role: "MERCHANT" }, params: { id: "session-11" } }, denied);
  assert.equal(denied.statusCode, 404);
  assert.equal(where.shopId, "shop-1");
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

test("opening a shift replays the same keyed request without creating a second session", async () => {
  const { prismaMock, sessions, lockQueries } = openSessionMock();
  const controller = loadController(prismaMock);
  const req = { user: { userId: "owner-1", role: "MERCHANT" }, body: { openingCash: 5000, note: "Morning", clientRequestId: "6a96c140-3837-4c4d-9e92-22858be82789" }, requestPhaseTimings: {} };
  const first = response();
  await controller.open(req, first, (error) => { throw error; });
  const replay = response();
  await controller.open({ ...req, audit: undefined }, replay, (error) => { throw error; });

  assert.equal(first.statusCode, 201);
  assert.equal(replay.statusCode, 200);
  assert.equal(first.payload.session.id, replay.payload.session.id);
  assert.equal("openRequestId" in first.payload.session, false);
  assert.equal("openRequestHash" in first.payload.session, false);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].openRequestHash.length, 64);
  assert.equal(lockQueries.filter((query) => query.includes('FROM "shops"')).length, 2);
  assert.ok(req.requestPhaseTimings.shop_lock >= 0);
  assert.ok(req.requestPhaseTimings.idempotency_lookup >= 0);
  assert.ok(req.requestPhaseTimings.transaction >= 0);
  assert.ok(req.requestPhaseTimings.summary >= 0);
  assert.equal(replay.audit, undefined);
});

test("a cash-session retry key cannot be reused with different shift details", async () => {
  const { prismaMock } = openSessionMock();
  const controller = loadController(prismaMock);
  const base = { user: { userId: "owner-1", role: "MERCHANT" }, body: { openingCash: 5000, note: "Morning", clientRequestId: "6a96c140-3837-4c4d-9e92-22858be82789" }, requestPhaseTimings: {} };
  await controller.open(base, response(), (error) => { throw error; });
  let caught;
  await controller.open({ ...base, body: { ...base.body, openingCash: 7000 } }, response(), (error) => { caught = error; });
  assert.equal(caught.status, 409);
  assert.match(caught.message, /different shift details/i);
});
