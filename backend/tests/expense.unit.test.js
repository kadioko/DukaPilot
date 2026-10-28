const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { endOfTanzaniaDay, startOfTanzaniaDay, startOfTanzaniaWeek, startOfTanzaniaMonth, tanzaniaDateKey } = require("../src/lib/businessTime");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/expense.controller.js");

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function loadController(prismaMock) {
  delete require.cache[controllerPath];
  delete require.cache[path.resolve(__dirname, "../src/lib/shopAccess.js")];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
  return require(controllerPath);
}

test("expense creation accepts the public name field and a backdated spentAt date", async () => {
  let captured;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    expense: {
      findFirst: async () => null,
      create: async ({ data }) => {
        captured = data;
        return { id: "expense-1", ...data };
      },
    },
  };
  prismaMock.$transaction = async (work) => work(prismaMock);
  prismaMock.$transaction = async (work) => work(prismaMock);
  const controller = loadController(prismaMock);
  const req = {
    user: { userId: "owner-1" },
    headers: { "x-dukapilot-language": "sw" },
    body: { name: "LUKU ya wiki iliyopita", amount: 25000, spentAt: "2026-07-29", category: "UTILITIES", requestKey: "677bd87f-4309-4568-a347-82138abde116" },
  };
  const res = response();

  await controller.create(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(captured.title, "LUKU ya wiki iliyopita");
  assert.equal(captured.spentAt.toISOString(), "2026-07-29T12:00:00.000Z");
});

test("actual expense retries with the same key return the saved entry without inserting another", async () => {
  let storedExpense = null;
  let createCount = 0;
  const requestKey = "8a2f5de9-e762-4d95-8a5c-5f13e0c961f9";
  const tx = {
    expense: {
      findFirst: async () => storedExpense,
      create: async ({ data }) => {
        createCount += 1;
        storedExpense = { id: "expense-once", ...data };
        return storedExpense;
      },
    },
  };
  const controller = loadController({ shop: { findUnique: async () => ({ id: "shop-1" }) }, $transaction: async (work) => work(tx) });
  const body = { title: "Internet", amount: 49000, category: "UTILITIES", paymentMethod: "MPESA", spentAt: "2026-10-27", requestKey };
  const first = response();
  await controller.create({ user: { userId: "owner-1" }, body }, first);
  assert.equal(first.statusCode, 201);
  const retry = response();
  await controller.create({ user: { userId: "owner-1" }, body }, retry);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.payload.reused, true);
  assert.equal(retry.payload.expense.id, "expense-once");
  assert.equal(createCount, 1);
});

test("legacy actual-expense clients use the API request ID as a retry key", async () => {
  let captured;
  const requestId = "e23fb28d-90a4-4b60-9e7d-16cab72d7784";
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    expense: {
      findFirst: async () => null,
      create: async ({ data }) => { captured = data; return { id: "legacy-expense", ...data }; },
    },
  };
  prismaMock.$transaction = async (work) => work(prismaMock);
  const controller = loadController(prismaMock);
  const res = response();

  await controller.create({
    user: { userId: "owner-1" },
    headers: { "x-request-id": requestId },
    body: { title: "Internet", amount: 49000, category: "UTILITIES", spentAt: "2026-10-27" },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(captured.requestKey, requestId);
});

test("expense validation uses Swahili and rejects an invalid date", async () => {
  const controller = loadController({ shop: { findUnique: async () => ({ id: "shop-1" }) } });
  const req = {
    user: { userId: "owner-1" },
    headers: { "x-dukapilot-language": "sw" },
    body: { name: "LUKU", amount: 25000, spentAt: "tarehe-mbaya" },
  };
  const res = response();

  await controller.create(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.code, "INVALID_EXPENSE_DATE");
  assert.match(res.payload.error, /Tarehe/);
});

test("stock purchases are rejected from normal expenses", async () => {
  let created = false;
  const controller = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    expense: { create: async () => { created = true; } },
  });
  const req = {
    user: { userId: "owner-1" },
    headers: { "x-dukapilot-language": "sw" },
    body: { title: "Mchele wa kuongezea stock", amount: 200000, spentAt: "2026-08-10", category: "STOCK" },
  };
  const res = response();

  await controller.create(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.code, "STOCK_PURCHASES_USE_INVENTORY");
  assert.equal(created, false);
});

test("recurring setup two days ahead creates only a schedule with the original due date", async () => {
  let expenseCreated = false;
  let recurringData;
  let scheduleCreateCount = 0;
  const requestKey = "d72d8f9a-21d2-4f85-a4a2-c8eaf34a31f9";
  let storedSchedule = null;
  const tx = {
    expense: { create: async () => { expenseCreated = true; } },
    recurringExpense: {
      findFirst: async () => storedSchedule,
      create: async ({ data }) => { scheduleCreateCount += 1; recurringData = data; storedSchedule = { id: "recurring-1", ...data }; return storedSchedule; },
    },
  };
  const controller = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $transaction: async (callback) => callback(tx),
  });
  const req = {
    user: { userId: "owner-1" },
    headers: { "x-dukapilot-language": "sw" },
    body: { title: "Wifi", amount: 49000, category: "UTILITIES", paymentMethod: "MPESA", spentAt: "2026-10-30", recurringMonthly: true, requestKey },
  };
  const res = response();

  await controller.create(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(expenseCreated, false);
  assert.equal(recurringData.paymentMethod, "MPESA");
  assert.equal(recurringData.spentAt, undefined);
  assert.equal(recurringData.nextDueAt.toISOString(), "2026-10-30T12:00:00.000Z");
  assert.equal(recurringData.dayOfMonth, 30);
  assert.equal(recurringData.requestKey, requestKey);
  const retryRes = response();
  await controller.create(req, retryRes);
  assert.equal(retryRes.statusCode, 200);
  assert.equal(retryRes.payload.reused, true);
  assert.equal(scheduleCreateCount, 1);
  assert.equal(expenseCreated, false);
});

test("a future actual expense is rejected rather than silently posted", async () => {
  let createCalls = 0;
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    expense: { create: async () => { createCalls += 1; } },
  };
  prismaMock.$transaction = async (work) => work(prismaMock);
  const controller = loadController(prismaMock);
  const futureDate = new Date(Date.parse(`${tanzaniaDateKey()}T00:00:00.000Z`) + 3 * 86400000).toISOString().slice(0, 10);
  const res = response();
  await controller.create({ user: { userId: "owner-1" }, body: { title: "Wifi", amount: 49000, category: "UTILITIES", spentAt: futureDate } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.code, "FUTURE_EXPENSE_DATE_NOT_ALLOWED");
  assert.equal(createCalls, 0);
});

test("expense list applies search, vendor, category, and date range filters", async () => {
  const sqlCalls = [];
  let salesArgs;
  const controller = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $queryRawUnsafe: async (query, ...params) => { sqlCalls.push({ query, params }); return []; },
    recurringExpense: { findMany: async () => [] },
    sale: { aggregate: async (args) => { salesArgs = args; return { _sum: { totalAmount: 0, profit: 0 }, _count: { id: 0 } }; } },
    $queryRaw: async () => [],
  });
  const req = {
    user: { userId: "owner-1" },
    headers: { "x-dukapilot-language": "sw" },
    query: { search: "luku", vendor: "TANESCO", category: "UTILITIES", from: "2026-07-01", to: "2026-07-31" },
  };
  const res = response();

  await controller.list(req, res);

  assert.equal(res.statusCode, 200);
  const expenseQuery = sqlCalls.find(({ query }) => query.includes("SELECT e.* FROM expenses e WHERE") && query.includes('e."spentAt" >= $'));
  assert.ok(expenseQuery);
  assert.match(expenseQuery.query, /e\.category = \$2/);
  assert.match(expenseQuery.query, /e\.vendor ILIKE/);
  assert.match(expenseQuery.query, /e\.title ILIKE/);
  assert.match(expenseQuery.query, /Africa\/Dar_es_Salaam/);
  assert.deepEqual(expenseQuery.params.slice(0, 4), ["shop-1", "UTILITIES", "TANESCO", "luku"]);
  assert.equal(expenseQuery.params[4].toISOString(), "2026-06-30T21:00:00.000Z");
  assert.equal(expenseQuery.params[5].toISOString(), "2026-07-31T21:00:00.000Z");
  assert.deepEqual(salesArgs.where.createdAt, { gte: expenseQuery.params[4], lt: expenseQuery.params[5] });
});

test("expense overview excludes legacy stock entries and reports sales-based metrics", async () => {
  let salesWhere;
  const expenseQueries = [];
  const controller = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $queryRawUnsafe: async (query, ...params) => {
      expenseQueries.push({ query, params });
      if (query.includes("COUNT(*)::int AS count")) return [{ total: 15000n, count: 2 }];
      if (query.includes("GROUP BY e.category")) return [{ category: "UTILITIES", total: 10000n }, { category: "RENT", total: 5000n }];
      return [];
    },
    recurringExpense: { findMany: async () => [] },
    sale: { aggregate: async ({ where }) => { salesWhere = where; return { _sum: { totalAmount: 100000, profit: 40000 }, _count: { id: 4 } }; } },
    $queryRaw: async () => [],
  });
  const req = { user: { userId: "owner-1" }, query: { period: "all" } };
  const res = response();

  await controller.list(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(expenseQueries.every(({ query }) => query.includes("e.category <> 'STOCK'") && query.includes("Africa/Dar_es_Salaam")), true);
  assert.deepEqual(salesWhere, { shopId: "shop-1", status: "COMPLETED", createdAt: { lt: endOfTanzaniaDay() } });
  assert.equal(res.payload.summary.expensePercentOfSales, 15);
  assert.equal(res.payload.summary.netProfit, 25000);
  assert.equal(res.payload.summary.previousTotal, null);
  assert.deepEqual(res.payload.summary.topCategories, [{ category: "UTILITIES", total: 10000 }, { category: "RENT", total: 5000 }]);
});

test("expense profit pressure includes dated customer returns and keeps damaged goods as a cost", async () => {
  const controller = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $queryRawUnsafe: async (query) => {
      if (query.includes("COUNT(*)::int AS count")) return [{ total: 200, count: 1 }];
      return [];
    },
    recurringExpense: { findMany: async () => [] },
    sale: { aggregate: async () => ({ _sum: { totalAmount: 2000, profit: 1000 }, _count: { id: 1 } }) },
    $queryRaw: async () => [{ returnedRevenue: 1000n, returnedProfit: 1000n }],
  });
  const res = response();
  await controller.list({ user: { userId: "owner-1" }, query: { period: "all" } }, res);
  assert.equal(res.payload.summary.totalSales, 1000);
  assert.equal(res.payload.summary.grossProfit, 0);
  assert.equal(res.payload.summary.netProfit, -200);
  assert.equal(res.payload.summary.expensePercentOfSales, 20);
});

test("expense reporting uses Tanzania half-open periods and clips every period at today", () => {
  const controller = loadController({});
  const now = new Date("2026-10-28T08:00:00.000Z");
  const today = controller.periodWindow("today", now);
  const week = controller.periodWindow("week", now);
  const month = controller.periodWindow("month", now);
  const all = controller.periodWindow("all", now);
  assert.equal(today.from.toISOString(), "2026-10-27T21:00:00.000Z");
  assert.equal(today.to.toISOString(), "2026-10-28T21:00:00.000Z");
  assert.equal(week.from.toISOString(), "2026-10-25T21:00:00.000Z");
  assert.equal(week.to.toISOString(), today.to.toISOString());
  assert.equal(month.from.toISOString(), "2026-09-30T21:00:00.000Z");
  assert.equal(month.to.toISOString(), today.to.toISOString());
  assert.equal(all.from, null);
  assert.equal(all.to.toISOString(), today.to.toISOString());
  assert.equal(tanzaniaDateKey(new Date(today.to.getTime() - 1)), "2026-10-28");
  assert.equal(startOfTanzaniaDay(now).toISOString(), today.from.toISOString());
  assert.equal(startOfTanzaniaWeek(now).toISOString(), week.from.toISOString());
  assert.equal(startOfTanzaniaMonth(now).toISOString(), month.from.toISOString());
  assert.equal(endOfTanzaniaDay(now).toISOString(), today.to.toISOString());
});

test("monthly recurrence preserves its original anchor through short months and leap years", () => {
  const controller = loadController({});
  const due = (value) => new Date(`${value}T12:00:00.000Z`);
  const key = (date) => tanzaniaDateKey(date);
  assert.equal(key(controller.advanceOneMonth(due("2027-01-30"), 30)), "2027-02-28");
  assert.equal(key(controller.advanceOneMonth(due("2027-02-28"), 30)), "2027-03-30");
  assert.equal(key(controller.advanceOneMonth(due("2027-01-31"), 31)), "2027-02-28");
  assert.equal(key(controller.advanceOneMonth(due("2027-02-28"), 31)), "2027-03-31");
  assert.equal(key(controller.advanceOneMonth(due("2028-01-31"), 31)), "2028-02-29");
  assert.equal(key(controller.advanceOneMonth(due("2028-02-29"), 31)), "2028-03-31");
});

test("future dated legacy expenses stay in the owner review queue after their due date", async () => {
  const suspect = { id: "legacy-future", title: "Wifi", amount: 49000, category: "UTILITIES", spentAt: new Date("2026-10-30T12:00:00.000Z"), createdAt: new Date("2026-10-28T08:00:00.000Z"), dateReviewedAt: null };
  const queries = [];
  const controller = loadController({
    shop: { findUnique: async () => ({ id: "shop-icy-lush" }) },
    $queryRawUnsafe: async (query) => {
      queries.push(query);
      if (query.includes("COUNT(*)::int AS count")) return [{ total: 0, count: 0 }];
      if (query.includes('e."dateReviewedAt" IS NULL')) return [suspect];
      return [];
    },
    recurringExpense: { findMany: async () => [] },
    sale: { aggregate: async () => ({ _sum: { totalAmount: 0, profit: 0 }, _count: { id: 0 } }) },
    $queryRaw: async () => [],
  });
  const res = response();
  await controller.list({ user: { userId: "icy-owner" }, query: { period: "all" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.summary.total, 0);
  assert.equal(res.payload.needsReviewExpenses[0].id, suspect.id);
  assert.equal(res.payload.needsReviewExpenses[0].canCorrect, true);
  assert.equal(queries.some((query) => query.includes('e."dateReviewedAt" IS NULL')), true);
  assert.equal(queries.every((query) => query.includes('e."shopId" = $1')), true);
});

test("owner verification explicitly releases a legacy future-dated expense into reporting", async () => {
  const existing = { id: "legacy-future", title: "Wifi", amount: 49000, category: "UTILITIES", paymentMethod: "MPESA", spentAt: new Date("2026-10-30T12:00:00.000Z"), createdAt: new Date("2026-10-28T08:00:00.000Z"), dateReviewedAt: null, cashSessionId: null };
  let updatedData;
  const tx = {
    expense: {
      findFirst: async () => existing,
      update: async ({ data }) => { updatedData = data; return { ...existing, ...data }; },
    },
  };
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-icy-lush" }) },
    expense: { findFirst: async () => existing },
    $transaction: async (work) => work(tx),
  };
  const controller = loadController(prismaMock);
  const res = response();
  await controller.update({ user: { userId: "icy-owner" }, params: { id: existing.id }, body: { spentAt: "2026-10-26", confirmActualPayment: true } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(updatedData.dateReviewedById, "icy-owner");
  assert.ok(updatedData.dateReviewedAt instanceof Date);
  assert.equal(res.payload.expense.spentAt.toISOString(), "2026-10-26T12:00:00.000Z");
});

test("owner cannot release a legacy future-dated expense without explicit payment confirmation", async () => {
  const existing = { id: "legacy-future", title: "Wifi", amount: 49000, category: "UTILITIES", paymentMethod: "MPESA", spentAt: new Date("2026-10-30T12:00:00.000Z"), createdAt: new Date("2026-10-28T08:00:00.000Z"), dateReviewedAt: null, cashSessionId: null };
  const controller = loadController({ shop: { findUnique: async () => ({ id: "shop-1" }) }, expense: { findFirst: async () => existing } });
  const res = response();
  await controller.update({ user: { userId: "owner-1" }, params: { id: existing.id }, body: { spentAt: "2026-10-26" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.code, "EXPENSE_DATE_REVIEW_CONFIRMATION_REQUIRED");
});

test("changing a non-cash expense to cash attaches it to the current open drawer", async () => {
  let updatedData;
  const existing = { id: "expense-1", title: "Transport", amount: 1000, category: "TRANSPORT", paymentMethod: "MPESA", spentAt: new Date(), cashSessionId: null };
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    expense: { findFirst: async () => existing, update: async ({ data }) => { updatedData = data; return { ...existing, ...data }; } },
    cashSession: { findFirst: async () => ({ id: "session-1", status: "OPEN" }) },
  };
  prismaMock.$transaction = async (work) => work(prismaMock);
  const controller = loadController(prismaMock);
  const res = response();
  await controller.update({ user: { userId: "owner-1" }, params: { id: existing.id }, body: { paymentMethod: "CASH" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(updatedData.cashSessionId, "session-1");
});

test("moving a cash expense away from today detaches it from the open drawer", async () => {
  let updatedData;
  const existing = { id: "expense-1", title: "Transport", amount: 1000, category: "TRANSPORT", paymentMethod: "CASH", spentAt: new Date(), cashSessionId: "session-1" };
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    expense: { findFirst: async () => existing, update: async ({ data }) => { updatedData = data; return { ...existing, ...data }; } },
    cashSession: { findFirst: async () => ({ status: "OPEN" }) },
  };
  prismaMock.$transaction = async (work) => work(prismaMock);
  const controller = loadController(prismaMock);
  const res = response();
  await controller.update({ user: { userId: "owner-1" }, params: { id: existing.id }, body: { spentAt: "2026-10-27" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(updatedData.cashSessionId, null);
});

test("recording a recurring expense creates one real ledger entry and advances its next date", async () => {
  let createdExpense;
  let updatedSchedule;
  const schedule = { id: "recurring-1", title: "Kodi", amount: 150000, category: "RENT", vendor: "Landlord", note: null, paymentMethod: "BANK", nextDueAt: new Date("2026-08-29T12:00:00.000Z"), dayOfMonth: 29 };
  const controller = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $transaction: async (callback) => callback({
      $queryRawUnsafe: async () => [],
      recurringExpense: {
        findFirst: async () => schedule,
        update: async ({ data }) => { updatedSchedule = data; },
      },
      expense: { findFirst: async () => null,
        create: async ({ data }) => { createdExpense = data; return { id: "expense-2", ...data }; },
      },
    }),
  });
  const req = { user: { userId: "owner-1" }, params: { id: "recurring-1" }, body: { spentAt: "2026-08-29", expectedDueAt: "2026-08-29", confirmedPayment: true, requestKey: "fc38a3fb-711b-42c6-8fd0-a8a1a58d70da" } };
  const res = response();

  await controller.recordRecurring(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(createdExpense.title, "Kodi");
  assert.equal(createdExpense.paymentMethod, "BANK");
  assert.equal(createdExpense.spentAt.toISOString(), "2026-08-29T12:00:00.000Z");
  assert.equal(createdExpense.recurrenceDueAt.toISOString(), "2026-08-29T12:00:00.000Z");
  assert.equal(updatedSchedule.nextDueAt.toISOString(), "2026-09-29T12:00:00.000Z");
  assert.equal(updatedSchedule.dayOfMonth, 29);
});

test("an explicitly confirmed advance payment records the real day and advances an October 30 schedule to November 30", async () => {
  let createdExpense;
  let nextDueAt;
  const today = tanzaniaDateKey();
  const tx = {
    $queryRawUnsafe: async () => [],
    recurringExpense: {
      findFirst: async () => ({ id: "wifi-schedule", title: "Wifi", amount: 49000, category: "UTILITIES", vendor: null, note: null, paymentMethod: "MPESA", nextDueAt: new Date("2026-10-30T12:00:00.000Z"), dayOfMonth: 30 }),
      update: async ({ data }) => { nextDueAt = data.nextDueAt; },
    },
    expense: { findFirst: async () => null, create: async ({ data }) => { createdExpense = data; return { id: "wifi-expense", ...data }; } },
  };
  const controller = loadController({ shop: { findUnique: async () => ({ id: "shop-icy-lush" }) }, $transaction: async (work) => work(tx) });
  const res = response();
  await controller.recordRecurring({
    user: { userId: "icy-owner" },
    params: { id: "wifi-schedule" },
    body: { spentAt: today, expectedDueAt: "2026-10-30", confirmedPayment: true, requestKey: "b6c2fe5f-671e-4429-a6fd-011c6e45fa1e" },
  }, res, (error) => { res.status(error.status || 500).json({ error: error.message, code: error.code }); });
  assert.equal(res.statusCode, 201);
  assert.equal(tanzaniaDateKey(createdExpense.spentAt), today);
  assert.equal(createdExpense.recurrenceDueAt.toISOString(), "2026-10-30T12:00:00.000Z");
  assert.equal(tanzaniaDateKey(nextDueAt), "2026-11-30");
});

test("a stale recurring due date cannot be recorded as another payment", async () => {
  let createCalls = 0;
  const tx = {
    $queryRawUnsafe: async () => [],
    recurringExpense: { findFirst: async () => ({ id: "recurring-1", title: "Wifi", amount: 49000, category: "UTILITIES", paymentMethod: "MPESA", nextDueAt: new Date("2026-10-30T12:00:00.000Z"), dayOfMonth: 30 }) },
    expense: { findFirst: async () => null, create: async () => { createCalls += 1; } },
  };
  const controller = loadController({ shop: { findUnique: async () => ({ id: "shop-1" }) }, $transaction: async (work) => work(tx) });
  const res = response();
  await controller.recordRecurring({
    user: { userId: "owner-1" },
    params: { id: "recurring-1" },
    body: { spentAt: tanzaniaDateKey(), expectedDueAt: "2026-10-29", confirmedPayment: true, requestKey: "0df0e8a5-4259-4a96-a4cf-532cb12da930" },
  }, res, (error) => { res.status(error.status || 500).json({ error: error.message, code: error.code }); });
  assert.equal(res.statusCode, 409);
  assert.equal(res.payload.code, "RECURRING_EXPENSE_STALE_OCCURRENCE");
  assert.equal(createCalls, 0);
});
