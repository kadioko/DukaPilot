const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const controllerPath = path.resolve(__dirname, "../src/controllers/assistant.controller.js");
const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const farmAccessPath = path.resolve(__dirname, "../src/lib/farmAccess.js");
const mockedPaths = [controllerPath, prismaPath, shopAccessPath, farmAccessPath];

function cachedModule(id, exports) {
  return { id, filename: id, loaded: true, exports };
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function loadController(prisma) {
  const originalCache = new Map(mockedPaths.map((file) => [file, require.cache[file]]));
  require.cache[prismaPath] = cachedModule(prismaPath, prisma);
  require.cache[shopAccessPath] = cachedModule(shopAccessPath, { getShopIdForUser: async () => "shop-1" });
  require.cache[farmAccessPath] = cachedModule(farmAccessPath, { getFarmConfiguration: async () => null });
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

function todayImpressionKey(actionKey) {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const day = String(now.getUTCFullYear()) + "-" + String(now.getUTCMonth() + 1).padStart(2, "0") + "-" + String(now.getUTCDate()).padStart(2, "0");
  return day + ":snapshot:" + actionKey;
}

test("recommendation impressions store a numeric measurement baseline, not business details", async () => {
  let inserted;
  const loader = loadController({
    debt: { aggregate: async () => ({ _sum: { amount: 9000, amountPaid: 2500 } }) },
    assistantActionEvent: { createMany: async ({ data }) => { inserted = data; return { count: data.length }; } },
  });
  try {
    const key = todayImpressionKey("debt");
    const res = response();
    await loader.controller.recordImpressions({ user: {}, body: { events: [{ actionKey: "debt", impressionKey: key }] } }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 201);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].measuredValue, 6500);
    assert.deepEqual(Object.keys(inserted[0]).sort(), ["actionKey", "eventType", "id", "impressionKey", "measuredValue", "shopId"].sort());
  } finally {
    loader.restore();
  }
});

test("completion verifies a debt reduction against the same impression baseline", async () => {
  let upsertArgs;
  let recordedEvents;
  const impressionKey = todayImpressionKey("debt");
  const loader = loadController({
    assistantAction: { upsert: async (args) => { upsertArgs = args; return { id: "action-1", ...args.create }; } },
    assistantActionEvent: {
      findFirst: async (args) => {
        assert.deepEqual(args.where, { shopId: "shop-1", actionKey: "debt", impressionKey, eventType: "SHOWN" });
        return { measuredValue: 10000 };
      },
    },
    debt: { aggregate: async () => ({ _sum: { amount: 12000, amountPaid: 5000 } }) },
    $transaction: async (callback) => callback({
      assistantAction: { upsert: async (args) => { upsertArgs = args; return { id: "action-1", ...args.create }; } },
      assistantActionEvent: { createMany: async ({ data }) => { recordedEvents = data; return { count: data.length }; } },
    }),
  });
  try {
    const res = response();
    await loader.controller.trackAction({
      user: {},
      body: { actionKey: "debt", impressionKey, title: "Collect debt", href: "/debts", status: "COMPLETED" },
    }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 201);
    assert.equal(upsertArgs.create.baselineValue, 10000);
    assert.equal(upsertArgs.create.outcomeValue, 7000);
    assert.ok(upsertArgs.create.outcomeVerifiedAt instanceof Date);
    assert.deepEqual(recordedEvents.map((event) => event.eventType), ["MARKED_DONE", "OUTCOME_VERIFIED"]);
  } finally {
    loader.restore();
  }
});

test("a missing impression baseline cannot reuse a stale prior action baseline", async () => {
  let upsertArgs;
  let recordedEvents;
  const impressionKey = todayImpressionKey("debt");
  const loader = loadController({
    assistantAction: { upsert: async (args) => { upsertArgs = args; return { id: "action-3", ...args.create }; } },
    assistantActionEvent: { findFirst: async () => null },
    debt: { aggregate: async () => ({ _sum: { amount: 10000, amountPaid: 5000 } }) },
    $transaction: async (callback) => callback({
      assistantAction: { upsert: async (args) => { upsertArgs = args; return { id: "action-3", ...args.create }; } },
      assistantActionEvent: { createMany: async ({ data }) => { recordedEvents = data; return { count: data.length }; } },
    }),
  });
  try {
    const res = response();
    await loader.controller.trackAction({ user: {}, body: { actionKey: "debt", impressionKey, title: "Collect debt", href: "/debts", status: "COMPLETED" } }, res, (error) => { throw error; });
    assert.equal(upsertArgs.create.baselineValue, null);
    assert.equal(upsertArgs.create.snapshotKey, impressionKey.slice(0, 10));
    assert.equal(upsertArgs.create.outcomeVerifiedAt, null);
    assert.deepEqual(recordedEvents.map((event) => event.eventType), ["MARKED_DONE"]);
  } finally {
    loader.restore();
  }
});

test("stock outcome measurements are scoped to the recommended product", async () => {
  let selectedProduct;
  let upsertArgs;
  const actionKey = "stock-product-7";
  const impressionKey = todayImpressionKey(actionKey);
  const loader = loadController({
    assistantAction: { upsert: async (args) => { upsertArgs = args; return { id: "action-2", ...args.create }; } },
    assistantActionEvent: { findFirst: async () => ({ measuredValue: 4500 }) },
    product: {
      findFirst: async (query) => {
        selectedProduct = query;
        return { currentStock: 7.25 };
      },
    },
    $transaction: async (callback) => callback({
      assistantAction: { upsert: async (args) => { upsertArgs = args; return { id: "action-2", ...args.create }; } },
      assistantActionEvent: { createMany: async () => ({ count: 0 }) },
    }),
  });
  try {
    const res = response();
    await loader.controller.trackAction({ user: {}, body: { actionKey, impressionKey, title: "Review stock", href: "/inventory", status: "COMPLETED" } }, res, (error) => { throw error; });
    assert.deepEqual(selectedProduct.where, { id: "product-7", shopId: "shop-1", isActive: true });
    assert.deepEqual(selectedProduct.select, { currentStock: true });
    assert.equal(upsertArgs.create.baselineValue, 4500);
    assert.equal(upsertArgs.create.outcomeValue, 7250);
    assert.ok(upsertArgs.create.outcomeVerifiedAt instanceof Date);
  } finally {
    loader.restore();
  }
});

test("a deleted or deactivated recommended product is not counted as a restock outcome", async () => {
  let upsertArgs;
  let recordedEvents;
  const actionKey = "stock-product-7";
  const impressionKey = todayImpressionKey(actionKey);
  const loader = loadController({
    assistantAction: { upsert: async (args) => { upsertArgs = args; return { id: "action-4", ...args.create }; } },
    assistantActionEvent: { findFirst: async () => ({ measuredValue: 0 }) },
    product: { findFirst: async () => null },
    $transaction: async (callback) => callback({
      assistantAction: { upsert: async (args) => { upsertArgs = args; return { id: "action-4", ...args.create }; } },
      assistantActionEvent: { createMany: async ({ data }) => { recordedEvents = data; return { count: data.length }; } },
    }),
  });
  try {
    const res = response();
    await loader.controller.trackAction({ user: {}, body: { actionKey, impressionKey, title: "Review stock", href: "/inventory", status: "COMPLETED" } }, res, (error) => { throw error; });
    assert.equal(upsertArgs.create.outcomeValue, null);
    assert.equal(upsertArgs.create.outcomeVerifiedAt, null);
    assert.deepEqual(recordedEvents.map((event) => event.eventType), ["MARKED_DONE"]);
  } finally {
    loader.restore();
  }
});

test("admin top actions count shown events by privacy-safe recommendation category", async () => {
  const queries = [];
  const loader = loadController({
    assistantAction: {
      count: async () => 5,
      groupBy: async () => [{ status: "COMPLETED", _count: { id: 2 } }],
      findMany: async () => [],
    },
    $queryRaw: async (parts) => {
      const query = parts.join("?");
      queries.push(query);
      if (query.includes('AS "actionType"')) return [{ actionType: "stock", count: 12 }];
      return [{ shown: 12, opened: 3, markedDone: 2, verified: 1 }];
    },
  });
  try {
    const res = response();
    await loader.controller.adminAnalytics({ query: { days: "30" } }, res, (error) => { throw error; });
    assert.match(queries.find((query) => query.includes('AS "actionType"')) || "", /'SHOWN'/);
    assert.deepEqual(res.payload.topActions, [{ actionType: "stock", count: 12, title: "Stock review" }]);
    assert.equal(res.payload.funnel.shown, 12);
    assert.equal(res.payload.funnel.openedRate, 25);
    assert.equal(JSON.stringify(res.payload.topActions).includes("product-7"), false);
  } finally {
    loader.restore();
  }
});
