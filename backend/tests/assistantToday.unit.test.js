const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { startOfTanzaniaMonth, endOfTanzaniaDay, tanzaniaDateKey } = require("../src/lib/businessTime");

const controllerPath = path.resolve(__dirname, "../src/controllers/assistantToday.controller.js");
const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const dashboardPath = path.resolve(__dirname, "../src/controllers/dashboard.controller.js");
const assistantPath = path.resolve(__dirname, "../src/controllers/assistant.controller.js");
const purchasePath = path.resolve(__dirname, "../src/controllers/purchaseAnalytics.controller.js");
const cashSessionPath = path.resolve(__dirname, "../src/controllers/cashSession.controller.js");
const mockedPaths = [controllerPath, prismaPath, shopAccessPath, dashboardPath, assistantPath, purchasePath, cashSessionPath];

function cachedModule(id, exports) {
  return { id, filename: id, loaded: true, exports };
}

function makeHandler(payload, error) {
  return async (_req, res, next) => {
    if (error) return next(error);
    return res.json(payload);
  };
}

function loadWithMocks({ prisma, overview, profitAnalytics, assistant, purchaseReport, currentCashSession } = {}) {
  const originalCache = new Map(mockedPaths.map((file) => [file, require.cache[file]]));
  const safePrisma = prisma || { $queryRaw: async () => [] };
  require.cache[prismaPath] = cachedModule(prismaPath, safePrisma);
  require.cache[shopAccessPath] = cachedModule(shopAccessPath, { getShopIdForUser: async (user) => user.shopId || "shop-1" });
  require.cache[dashboardPath] = cachedModule(dashboardPath, {
    overview: overview || makeHandler({ summary: {} }),
    profitAnalytics: profitAnalytics || makeHandler({ summary: {} }),
  });
  require.cache[purchasePath] = cachedModule(purchasePath, { report: purchaseReport || makeHandler({ summary: { receiptCount: 0, landedCost: 0 }, suppliers: [] }) });
  require.cache[cashSessionPath] = cachedModule(cashSessionPath, { current: currentCashSession || makeHandler({ session: null }) });
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

test("Ask recognizes supported English and Kiswahili wording without mixing topics", () => {
  const loader = loadWithMocks();
  try {
    const { detectIntent } = loader.controller;
    for (const question of ["Mauzo ya mwezi huu ni kiasi gani?", "Nimeuza kiasi gani leo?", "How much cash collected this week?"]) assert.equal(detectIntent(question), "salesToday");
    for (const question of ["Faida ya wiki hii ni kiasi gani?", "Gharama ya bidhaa zilizouzwa leo ni kiasi gani?", "What is my profit on sales?"]) assert.equal(detectIntent(question), "profit");
    assert.equal(detectIntent("Ni bidhaa gani inahitaji kuagizwa?"), "inventory");
    assert.equal(detectIntent("Which product may need reordering?"), "inventory");
    assert.equal(detectIntent("Madeni yaliyobaki ni kiasi gani?"), "debts");
    assert.equal(detectIntent("Matumizi ya leo ni kiasi gani?"), "expenses");
    assert.equal(detectIntent("Ni shughuli gani ya shamba nikague?"), "farm");
    assert.equal(detectIntent("Ni bidhaa gani zinaisha muda siku 30 zijazo?"), "expiry");
    assert.equal(detectIntent("Ni ratiba gani za matumizi zinatarajiwa?"), "scheduledExpenses");
    assert.equal(detectIntent("Stock iliyopokelewa mwezi huu ni kiasi gani?"), "purchases");
    assert.equal(detectIntent("Mauzo ya mkopo mwezi huu yalikuwa mangapi?"), "creditSales");
    assert.equal(detectIntent("Which quotations need follow-up?"), "quotations");
    assert.equal(detectIntent("How much sales and expenses this month?"), "ambiguous");
  } finally { loader.restore(); }
});

test("Ask reports received-stock landed cost, not an expense or payment, and enforces stock and report permissions", async () => {
  let calls = 0;
  const loader = loadWithMocks({ purchaseReport: async (req, res) => { calls += 1; assert.equal(req.query.period, "custom"); return res.json({ summary: { receiptCount: 2, landedCost: 65000 }, suppliers: [] }); } });
  try {
    const denied = response();
    await loader.controller.ask({ ...request({ userId: "owner", staffId: "staff", permissions: { canManageStock: true, canViewReports: false } }), body: { question: "How much stock was received this month?" } }, denied, (error) => { throw error; });
    assert.match(denied.payload.answer.message, /permission/i);
    assert.equal(calls, 0);
    const permitted = response();
    await loader.controller.ask({ ...request({ userId: "owner" }), body: { question: "How much stock was received this month?" } }, permitted, (error) => { throw error; });
    assert.equal(calls, 1);
    assert.match(permitted.payload.answer.message, /65,000/);
    assert.match(permitted.payload.answer.message, /not the amount paid or an operating expense/);
  } finally { loader.restore(); }
});

test("Ask scopes expiry and scheduled expense queries to the current shop without treating reminders as payments", async () => {
  const scopes = [];
  const loader = loadWithMocks({ prisma: {
    product: { findMany: async (query) => { scopes.push(query.where.shopId); return [{ name: "Milk", expiryDate: new Date("2026-11-10T12:00:00Z") }]; } },
    recurringExpense: { findMany: async (query) => { scopes.push(query.where.shopId); return [{ title: "Wifi", amount: 49000, nextDueAt: new Date("2026-11-10T12:00:00Z") }]; } },
  } });
  try {
    const expiry = response();
    await loader.controller.ask({ ...request({ userId: "owner" }), body: { question: "Which products expire in the next 30 days?" } }, expiry, (error) => { throw error; });
    assert.match(expiry.payload.answer.message, /Milk/);
    const schedule = response();
    await loader.controller.ask({ ...request({ userId: "owner" }), body: { question: "What recurring expenses are due?" } }, schedule, (error) => { throw error; });
    assert.match(schedule.payload.answer.message, /49,000/);
    assert.match(schedule.payload.answer.message, /not confirmed payments/);
    assert.deepEqual(scopes, ["shop-1", "shop-1"]);
  } finally { loader.restore(); }
});

test("Ask distinguishes credit sales and return values from refunds and debt balances", async () => {
  const loader = loadWithMocks({ profitAnalytics: async (_req, res) => res.json({ summary: { salesReturns: 9000, salesReturnReversals: 2000, refunds: 5000, refundRecoveries: 1000 }, salesPaymentBreakdown: [{ paymentMethod: "CREDIT", salesCount: 3, amount: 25000 }] }) });
  try {
    const credit = response();
    await loader.controller.ask({ ...request({ userId: "owner" }), body: { question: "How many credit sales this month?" } }, credit, (error) => { throw error; });
    assert.match(credit.payload.answer.message, /3 sales/);
    assert.match(credit.payload.answer.message, /neither cash collected nor the current debt balance/);
    const returns = response();
    await loader.controller.ask({ ...request({ userId: "owner" }), body: { question: "How much was refunded this month?" } }, returns, (error) => { throw error; });
    assert.match(returns.payload.answer.message, /7,000/);
    assert.match(returns.payload.answer.message, /5,000/);
    assert.match(returns.payload.answer.message, /1,000/);
  } finally { loader.restore(); }
});

test("Ask only accesses the current actor's cash shift when allowed", async () => {
  let calls = 0;
  const loader = loadWithMocks({ currentCashSession: async (req, res) => { calls += 1; assert.equal(req.user.staffId, "staff-1"); return res.json({ session: { summary: { expectedCash: 12000 } }, sessions: [{ summary: { expectedCash: 999999 } }] }); } });
  try {
    const actor = { userId: "owner", staffId: "staff-1", permissions: { canSell: true } };
    const res = response();
    await loader.controller.ask({ ...request(actor), body: { question: "What is expected in my cash drawer?" } }, res, (error) => { throw error; });
    assert.match(res.payload.answer.message, /12,000/);
    assert.doesNotMatch(res.payload.answer.message, /999,999/);
    const denied = response();
    await loader.controller.ask({ ...request({ ...actor, permissions: {} }), body: { question: "Is my shift open?" } }, denied, (error) => { throw error; });
    assert.match(denied.payload.answer.message, /permission/i);
    assert.equal(calls, 1);
    assert.equal(loader.controller.detectIntent("Which team shifts have a difference?"), "unsupported");
  } finally { loader.restore(); }
});

test("overdue debt answers use Tanzania day boundaries and display only permitted records", () => {
  const loader = loadWithMocks();
  try {
    const today = new Date(`${tanzaniaDateKey(new Date())}T00:00:00+03:00`);
    const snapshot = { sections: { debts: { status: "ready", checkedAt: new Date().toISOString(), data: { summary: { openCount: 2, totalOwed: 12000 }, debts: [
      { customerName: "Past due", amount: 10000, amountPaid: 3000, dueDate: new Date(today.getTime() - 86400000) },
      { customerName: "Due today", amount: 5000, amountPaid: 0, dueDate: today },
    ] } } } };
    const answer = loader.controller.askAnswer("debts", snapshot, "en", "Which debts are overdue?");
    assert.match(answer.message, /Past due: TZS 7,000/);
    assert.doesNotMatch(answer.message, /Due today/);
    const denied = loader.controller.askAnswer("debts", { sections: { debts: { status: "not_permitted" } } }, "en", "Who owes me?");
    assert.match(denied.message, /permission/);
    assert.doesNotMatch(denied.message, /Past due/);
  } finally { loader.restore(); }
});

test("Ask clearly declines unsupported and mixed-topic requests without querying business data", async () => {
  let queried = false;
  const loader = loadWithMocks({ profitAnalytics: async (_req, res) => { queried = true; return res.json({ summary: {} }); } });
  try {
    for (const question of ["Which product sold the most?", "Who is my best customer?", "How do I grow my business?", "How much sales and expenses this month?"]) {
      const res = response();
      await loader.controller.ask({ ...request({ userId: "owner-1", language: "en" }), body: { question } }, res, (error) => { throw error; });
      assert.match(res.payload.answer.message, /cannot answer|one topic at a time/i);
      assert.match(res.payload.answer.message, /Try:/);
      assert.deepEqual(res.payload.answer.evidence, []);
    }
    assert.equal(queried, false);
  } finally { loader.restore(); }
});

test("period follow-ups are signed and cannot cross business, branch, or staff identity", async () => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-context-secret";
  let calls = 0;
  const loader = loadWithMocks({ profitAnalytics: async (_req, res) => { calls += 1; return res.json({ summary: { salesCount: 1, netSalesRevenue: 12000 } }); } });
  try {
    const ask = async (user, question, contextToken) => {
      const res = response();
      await loader.controller.ask({ ...request(user), body: { question, contextToken } }, res, (error) => { throw error; });
      return res.payload;
    };
    const first = await ask({ userId: "owner-1", shopId: "shop-1" }, "Sales this month");
    assert.ok(first.contextToken);
    const followUp = await ask({ userId: "owner-1", shopId: "shop-1" }, "And last month?", first.contextToken);
    assert.match(followUp.answer.message, /last month/i);
    assert.equal(calls, 2);
    for (const user of [{ userId: "owner-2", shopId: "shop-1" }, { userId: "owner-1", shopId: "shop-2" }, { userId: "owner-1", shopId: "shop-1", staffId: "staff-1", permissions: { canViewReports: true } }]) {
      const result = await ask(user, "And last month?", first.contextToken);
      assert.match(result.answer.message, /cannot answer/i);
    }
    const tampered = await ask({ userId: "owner-1", shopId: "shop-1" }, "And last month?", `${first.contextToken}x`);
    assert.match(tampered.answer.message, /cannot answer/i);
    const otherRequest = await ask({ userId: "owner-1", shopId: "shop-1" }, "What about last month and my customers?", first.contextToken);
    assert.match(otherRequest.answer.message, /cannot answer/i);
    assert.equal(calls, 2);
    const staff = { userId: "owner-1", shopId: "shop-1", staffId: "staff-1", permissions: { canViewReports: true } };
    const staffAnswer = await ask(staff, "Sales this month");
    const revoked = await ask({ ...staff, permissions: { canViewReports: false } }, "And last month?", staffAnswer.contextToken);
    assert.match(revoked.answer.message, /permission/i);
    assert.equal(calls, 3);
  } finally {
    loader.restore();
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
  }
});

test("Ask expense questions use the requested month instead of the default seven-day window", async () => {
  const ranges = [];
  const monthStart = startOfTanzaniaMonth(new Date());
  const expectedEnd = endOfTanzaniaDay();
  const loader = loadWithMocks({
    prisma: {
      $queryRawUnsafe: async (query, ...params) => {
        if (query.includes("COUNT(*)::int AS count")) {
          ranges.push({ from: params[1], to: params[2], query });
          return [{ total: params[1].getTime() >= monthStart.getTime() ? 42000 : 18000, count: 4 }];
        }
        if (query.includes("MAX(e.\"updatedAt\")")) return [{ updatedAt: new Date("2026-10-28T08:00:00.000Z") }];
        return [];
      },
    },
  });
  try {
    const res = response();
    await loader.controller.ask({ ...request({ userId: "owner-1", language: "en" }), body: { question: "What are expenses this month?" } }, res, (error) => { throw error; });
    assert.equal(ranges.length, 2);
    assert.equal(tanzaniaDateKey(ranges[0].from), tanzaniaDateKey(monthStart));
    assert.equal(ranges[0].to.toISOString(), expectedEnd.toISOString());
    assert.equal(ranges.every((range) => range.query.includes('e."requiresDateReview"') && range.query.includes("AT TIME ZONE 'UTC'")), true);
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
    assert.equal(tanzaniaDateKey(new Date(window.previousTo.getTime() - 1)), "2026-09-28");
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
    assert.equal(tanzaniaDateKey(new Date(window.previousTo.getTime() - 1)), "2026-02-28");
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
