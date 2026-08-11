const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

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
      create: async ({ data }) => {
        captured = data;
        return { id: "expense-1", ...data };
      },
    },
  };
  prismaMock.$transaction = async (work) => work(prismaMock);
  const controller = loadController(prismaMock);
  const req = {
    user: { userId: "owner-1" },
    headers: { "x-dukapilot-language": "sw" },
    body: { name: "LUKU ya wiki iliyopita", amount: 25000, spentAt: "2026-07-29", category: "UTILITIES" },
  };
  const res = response();

  await controller.create(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(captured.title, "LUKU ya wiki iliyopita");
  assert.equal(captured.spentAt.toISOString(), "2026-07-29T12:00:00.000Z");
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

test("recurring expense creation stores payment method and advances the schedule without a future ledger entry", async () => {
  let expenseData;
  let recurringData;
  const controller = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $transaction: async (callback) => callback({
      expense: { create: async ({ data }) => { expenseData = data; return { id: "expense-1", ...data }; } },
      recurringExpense: { create: async ({ data }) => { recurringData = data; return { id: "recurring-1", ...data }; } },
    }),
  });
  const req = {
    user: { userId: "owner-1" },
    headers: { "x-dukapilot-language": "sw" },
    body: { title: "Kodi", amount: 150000, category: "RENT", paymentMethod: "MPESA", spentAt: "2026-07-29", recurringMonthly: true },
  };
  const res = response();

  await controller.create(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(expenseData.paymentMethod, "MPESA");
  assert.equal(expenseData.spentAt.toISOString(), "2026-07-29T12:00:00.000Z");
  assert.equal(recurringData.paymentMethod, "MPESA");
  assert.equal(recurringData.spentAt, undefined);
  assert.equal(recurringData.nextDueAt.toISOString(), "2026-08-29T12:00:00.000Z");
});

test("expense list applies search, vendor, category, and date range filters", async () => {
  let findManyArgs;
  let aggregateArgs;
  const controller = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    expense: {
      findMany: async (args) => { findManyArgs = args; return []; },
      aggregate: async (args) => { aggregateArgs = args; return { _sum: { amount: 0 }, _count: { id: 0 } }; },
      groupBy: async () => [],
    },
    recurringExpense: { findMany: async () => [] },
    sale: { aggregate: async () => ({ _sum: { totalAmount: 0, profit: 0 }, _count: { id: 0 } }) },
  });
  const req = {
    user: { userId: "owner-1" },
    headers: { "x-dukapilot-language": "sw" },
    query: { search: "luku", vendor: "TANESCO", category: "UTILITIES", from: "2026-07-01", to: "2026-07-31" },
  };
  const res = response();

  await controller.list(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(findManyArgs.where.category, "UTILITIES");
  assert.equal(findManyArgs.where.vendor.contains, "TANESCO");
  assert.equal(findManyArgs.where.spentAt.gte.toISOString(), "2026-07-01T12:00:00.000Z");
  assert.equal(findManyArgs.where.spentAt.lte.toISOString(), "2026-07-31T23:59:59.999Z");
  assert.equal(findManyArgs.where.OR.length, 3);
  assert.deepEqual(aggregateArgs.where, findManyArgs.where);
});

test("expense overview excludes legacy stock entries and reports sales-based metrics", async () => {
  let expenseWhere;
  let salesWhere;
  const controller = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    expense: {
      findMany: async ({ where }) => { expenseWhere = where; return []; },
      aggregate: async () => ({ _sum: { amount: 15000 }, _count: { id: 2 } }),
      groupBy: async () => [{ category: "UTILITIES", _sum: { amount: 10000 } }, { category: "RENT", _sum: { amount: 5000 } }],
    },
    recurringExpense: { findMany: async () => [] },
    sale: { aggregate: async ({ where }) => { salesWhere = where; return { _sum: { totalAmount: 100000, profit: 40000 }, _count: { id: 4 } }; } },
  });
  const req = { user: { userId: "owner-1" }, query: { period: "all" } };
  const res = response();

  await controller.list(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(expenseWhere.category, { not: "STOCK" });
  assert.deepEqual(salesWhere, { shopId: "shop-1", status: "COMPLETED" });
  assert.equal(res.payload.summary.expensePercentOfSales, 15);
  assert.equal(res.payload.summary.netProfit, 25000);
  assert.equal(res.payload.summary.previousTotal, null);
  assert.deepEqual(res.payload.summary.topCategories, [{ category: "UTILITIES", total: 10000 }, { category: "RENT", total: 5000 }]);
});

test("recording a recurring expense creates one real ledger entry and advances its next date", async () => {
  let createdExpense;
  let updatedSchedule;
  const controller = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    $transaction: async (callback) => callback({
      recurringExpense: {
        findFirst: async () => ({ id: "recurring-1", title: "Kodi", amount: 150000, category: "RENT", vendor: "Landlord", note: null, paymentMethod: "BANK", nextDueAt: new Date("2026-08-29T12:00:00.000Z") }),
        update: async ({ data }) => { updatedSchedule = data; },
      },
      expense: { create: async ({ data }) => { createdExpense = data; return { id: "expense-2", ...data }; } },
    }),
  });
  const req = { user: { userId: "owner-1" }, params: { id: "recurring-1" }, body: { spentAt: "2026-08-29" } };
  const res = response();

  await controller.recordRecurring(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(createdExpense.title, "Kodi");
  assert.equal(createdExpense.paymentMethod, "BANK");
  assert.equal(createdExpense.spentAt.toISOString(), "2026-08-29T12:00:00.000Z");
  assert.equal(updatedSchedule.nextDueAt.toISOString(), "2026-09-29T12:00:00.000Z");
});
