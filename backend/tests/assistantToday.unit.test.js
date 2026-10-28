const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { startOfTanzaniaMonth, tanzaniaDateKey } = require("../src/lib/businessTime");

const controllerPath = path.resolve(__dirname, "../src/controllers/assistantToday.controller.js");
const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const dashboardPath = path.resolve(__dirname, "../src/controllers/dashboard.controller.js");
const assistantPath = path.resolve(__dirname, "../src/controllers/assistant.controller.js");
const mockedPaths = [controllerPath, prismaPath, shopAccessPath, dashboardPath, assistantPath];

function cachedModule(id, exports) {
  return { id, filename: id, loaded: true, exports };
}

function makeHandler(payload, error) {
  return async (_req, res, next) => {
    if (error) return next(error);
    return res.json(payload);
  };
}

function loadWithMocks({ prisma, overview, profitAnalytics, assistant } = {}) {
  const originalCache = new Map(mockedPaths.map((file) => [file, require.cache[file]]));
  const safePrisma = prisma || { $queryRaw: async () => [] };
  require.cache[prismaPath] = cachedModule(prismaPath, safePrisma);
  require.cache[shopAccessPath] = cachedModule(shopAccessPath, { getShopIdForUser: async () => "shop-1" });
  require.cache[dashboardPath] = cachedModule(dashboardPath, {
    overview: overview || makeHandler({ summary: {} }),
    profitAnalytics: profitAnalytics || makeHandler({ summary: {} }),
  });
  require.cache[assistantPath] = cachedModule(assistantPath, assistant || {
    stockSummary: makeHandler({ actions: [] }),
    quotationSummary: makeHandler({ actions: [] }),
    farmSummary: makeHandler({ actions: [] }),
    listActions: makeHandler({ actions: [] }),
  });
  delete require.cache[controllerPath];
  return {
    controller: require(controllerPath),
    restore() {
      for (const file of mockedPaths) {
        const original = originalCache.get(file);
        if (original) require.cache[file] = original;
        else delete require.cache[file];
      }
    },
  };
}

function request(user, query = {}) {
  return { user, query, headers: { "x-dukapilot-language": "en" } };
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("assistant snapshot isolates a failed section and retains healthy inventory data", async () => {
  const loader = loadWithMocks({
    overview: makeHandler(null, new Error("dashboard database failure")),
    prisma: { $queryRaw: async () => [] },
  });
  try {
    const snapshot = await loader.controller.loadSnapshot(request({ userId: "owner-1" }), ["salesToday", "inventory"]);
    assert.equal(snapshot.sections.salesToday.status, "unavailable");
    assert.equal(snapshot.sections.inventory.status, "ready");
    assert.deepEqual(snapshot.sections.inventory.data.products, []);
  } finally {
    loader.restore();
  }
});

test("assistant snapshot applies staff permissions before querying financial sources", async () => {
  let rawQueryCount = 0;
  const loader = loadWithMocks({ prisma: { $queryRaw: async () => { rawQueryCount += 1; return []; } } });
  try {
    const snapshot = await loader.controller.loadSnapshot(request({
      userId: "owner-1",
      staffId: "staff-1",
      permissions: { canManageStock: true, canSell: true, canRecordExpenses: false, canViewReports: false, canManageFarm: false },
    }));
    assert.equal(snapshot.sections.inventory.status, "ready");
    assert.equal(snapshot.sections.salesToday.status, "not_permitted");
    assert.equal(snapshot.sections.debts.status, "not_permitted");
    assert.equal(snapshot.sections.expenses.status, "not_permitted");
    assert.equal(snapshot.sections.quotations.status, "not_permitted");
    assert.equal(snapshot.sections.farm.status, "not_permitted");
    assert.equal(snapshot.sections.actionHistory.status, "not_permitted");
    assert.equal(rawQueryCount, 1);
    assert.equal(JSON.stringify(snapshot).includes("buyingPrice"), false);
    assert.equal(JSON.stringify(snapshot).includes("sellingPrice"), false);
  } finally {
    loader.restore();
  }
});

test("stock forecast requires enough history and estimates 14-day replenishment from net returned units", async () => {
  const since28Days = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  let sql = "";
  const loader = loadWithMocks({
    prisma: {
      $queryRaw: async (parts) => {
        sql = parts.join("?");
        return [
          { id: "reliable", name: "Unga", currentStock: 4, minimumStock: 8, unit: "kg", buyingPrice: 1500, soldQuantity: 56, salesDays: 14, firstSaleAt: since28Days, lastSaleAt: new Date() },
          { id: "sparse", name: "Mafuta", currentStock: 0, minimumStock: 2, unit: "L", buyingPrice: 5000, soldQuantity: 2, salesDays: 1, firstSaleAt: since28Days, lastSaleAt: new Date() },
        ];
      },
    },
  });
  try {
    const { products } = await loader.controller.loadInventoryEvidence("shop-1", true);
    assert.match(sql, /returnedQuantity/);
    assert.match(sql, /isInternalUse/);
    assert.equal(products[0].hasReliablePace, true);
    assert.equal(products[0].daysOfCoverage, 2);
    assert.equal(products[0].reorderQuantity14d, 24);
    assert.equal(products[0].estimatedReorderCost, 36000);
    assert.equal(products[1].hasReliablePace, false);
    assert.equal("daysOfCoverage" in products[1], false);
    assert.equal("reorderQuantity14d" in products[1], false);
    assert.equal("estimatedReorderCost" in products[1], false);
  } finally {
    loader.restore();
  }
});

test("Ask answers inventory from the authorized snapshot without external AI or mutations", async () => {
  let writes = 0;
  const loader = loadWithMocks({
    prisma: {
      $queryRaw: async () => [{ id: "p-1", name: "Unga", currentStock: 4, minimumStock: 8, unit: "kg", buyingPrice: 1000, soldQuantity: 56, salesDays: 14, firstSaleAt: new Date(Date.now() - 28 * 86400000), lastSaleAt: new Date(), updatedAt: new Date() }],
      $executeRaw: async () => { writes += 1; },
    },
  });
  try {
    const res = response();
    await loader.controller.ask({ ...request({ userId: "owner-1", language: "en" }), body: { question: "" } }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 400);
    const askRes = response();
    await loader.controller.ask({ ...request({ userId: "owner-1", language: "en" }), body: { question: "Which product may run out?" } }, askRes, (error) => { throw error; });
    assert.match(askRes.payload.answer.message, /may last about 2 days/);
    assert.match(askRes.payload.answer.message, /not a purchase order/);
    assert.equal(askRes.payload.answer.privacy.includes("no external AI service"), true);
    assert.equal(writes, 0);
  } finally {
    loader.restore();
  }
});

test("Ask interprets calendar months in Tanzania time and uses the requested sales range", async () => {
  let query;
  const loader = loadWithMocks({
    profitAnalytics: async (req, res) => {
      query = req.query;
      return res.json({ summary: { netSalesRevenue: 210000, salesCount: 4, cashCollected: 160000 }, from: new Date("2026-10-01T21:00:00.000Z"), to: new Date("2026-10-28T09:00:00.000Z") });
    },
  });
  try {
    const res = response();
    await loader.controller.ask({ ...request({ userId: "owner-1", language: "en" }), body: { question: "How much sales this month?" } }, res, (error) => { throw error; });
    assert.equal(query.period, "custom");
    assert.equal(query.from, tanzaniaDateKey(startOfTanzaniaMonth(new Date())));
    assert.equal(query.to, tanzaniaDateKey(new Date()));
    assert.match(res.payload.answer.message, /this month/i);
    assert.match(res.payload.answer.message, /210,000/);
    assert.match(res.payload.answer.message, /Cash collected.*160,000/);
  } finally {
    loader.restore();
  }
});

test("Ask expense questions use the requested month instead of the default seven-day window", async () => {
  const ranges = [];
  const monthStart = startOfTanzaniaMonth(new Date());
  const loader = loadWithMocks({
    prisma: {
      expense: {
        aggregate: async ({ where }) => {
          ranges.push(where.spentAt);
          const current = monthStart.getTime();
          return { _sum: { amount: where.spentAt.gte.getTime() >= current ? 42000 : 18000 }, _count: { id: 4 } };
        },
        findMany: async () => [],
        findFirst: async () => ({ updatedAt: new Date("2026-10-28T08:00:00.000Z") }),
      },
    },
  });
  try {
    const res = response();
    await loader.controller.ask({ ...request({ userId: "owner-1", language: "en" }), body: { question: "What are expenses this month?" } }, res, (error) => { throw error; });
    assert.equal(ranges.length, 2);
    assert.equal(tanzaniaDateKey(ranges[0].gte), tanzaniaDateKey(monthStart));
    assert.match(res.payload.answer.message, /expenses for this month/i);
    assert.match(res.payload.answer.message, /42,000/);
  } finally {
    loader.restore();
  }
});

test("month-to-date comparisons use the corresponding prior-month calendar dates", () => {
  const loader = loadWithMocks();
  try {
    const now = new Date("2026-10-28T08:30:00.000Z");
    const { window } = loader.controller.requestedTimeWindow("expenses this month", "expenses", now);
    assert.equal(tanzaniaDateKey(window.from), "2026-10-01");
    assert.equal(tanzaniaDateKey(window.previousFrom), "2026-09-01");
    assert.equal(tanzaniaDateKey(window.previousTo), "2026-09-28");
    assert.equal(window.previousTo.getUTCHours(), window.to.getUTCHours());
  } finally {
    loader.restore();
  }
});

test("calendar-month comparison clamps month-end dates instead of rolling into another month", () => {
  const loader = loadWithMocks();
  try {
    const now = new Date("2026-03-30T21:00:00.000Z");
    const { window } = loader.controller.requestedTimeWindow("expenses this month", "expenses", now);
    assert.equal(tanzaniaDateKey(window.previousTo), "2026-02-28");
    assert.equal(window.previousTo.getUTCHours(), window.to.getUTCHours());
  } finally {
    loader.restore();
  }
});

test("Ask clarifies unsupported historical questions instead of substituting current data", async () => {
  let queried = false;
  const loader = loadWithMocks({ prisma: { $queryRaw: async () => { queried = true; return []; } } });
  try {
    const res = response();
    await loader.controller.ask({ ...request({ userId: "owner-1", language: "en" }), body: { question: "Show stock last month" } }, res, (error) => { throw error; });
    assert.match(res.payload.answer.message, /date filtering is not supported/i);
    assert.equal(queried, false);
  } finally {
    loader.restore();
  }
});

test("Ask clarifies unsupported day ranges and slash-formatted dates without loading today's data", async () => {
  let queried = false;
  const loader = loadWithMocks({
    profitAnalytics: async (_req, res) => {
      queried = true;
      return res.json({ summary: { netSalesRevenue: 99000 } });
    },
  });
  try {
    for (const question of ["How much sales for the last 30 days?", "How much sales on 10/01/2026?"]) {
      const res = response();
      await loader.controller.ask({ ...request({ userId: "owner-1", language: "en" }), body: { question } }, res, (error) => { throw error; });
      assert.match(res.payload.answer.message, /Specify a supported period/i);
      assert.match(res.payload.answer.privacy, /No business data was queried/i);
    }
    assert.equal(queried, false);
  } finally {
    loader.restore();
  }
});

test("assistant source retry rejects unknown sections", async () => {
  const loader = loadWithMocks();
  try {
    const res = response();
    await loader.controller.today({ ...request({ userId: "owner-1" }, { source: "customers" }) }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 400);
    assert.match(res.payload.error, /Unknown assistant source/);
  } finally {
    loader.restore();
  }
});
