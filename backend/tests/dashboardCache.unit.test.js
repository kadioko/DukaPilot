const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { dashboardHistory, invalidateDashboardHistory } = require("../src/services/dashboard-cache.service");

test("dashboard history is tenant-keyed, reused briefly, and invalidated after a mutation", async () => {
  let loads = 0;
  const load = async () => ({ allTimeRows: [{ totalSales: loads += 1 }], historyRows: [], allExpenseAgg: { _sum: { amount: 0 }, _count: { id: 0 } } });

  const first = await dashboardHistory("shop-cache-test", load);
  const second = await dashboardHistory("shop-cache-test", load);
  assert.equal(first.allTimeRows[0].totalSales, 1);
  assert.equal(second.allTimeRows[0].totalSales, 1);
  assert.equal(loads, 1);

  await invalidateDashboardHistory("shop-cache-test");
  const third = await dashboardHistory("shop-cache-test", load);
  assert.equal(third.allTimeRows[0].totalSales, 2);
  assert.equal(loads, 2);
});

test("parallel dashboard cache misses for one shop share a single loader", async () => {
  let loads = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const load = async () => {
    loads += 1;
    await barrier;
    return { total: 42 };
  };

  const first = dashboardHistory("shop-single-flight-test", load);
  const second = dashboardHistory("shop-single-flight-test", load);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loads, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), [{ total: 42 }, { total: 42 }]);
});

test("cache invalidation prevents an older in-flight load from replacing fresh history", async () => {
  let releaseOldLoad;
  const oldLoad = dashboardHistory("shop-cache-invalidation-race", () => new Promise((resolve) => { releaseOldLoad = resolve; }));
  await new Promise((resolve) => setImmediate(resolve));

  await invalidateDashboardHistory("shop-cache-invalidation-race");
  const fresh = await dashboardHistory("shop-cache-invalidation-race", async () => ({ version: 2 }));
  releaseOldLoad({ version: 1 });
  await oldLoad;

  const cached = await dashboardHistory("shop-cache-invalidation-race", async () => { throw new Error("expected fresh cached value"); });
  assert.deepEqual(fresh, { version: 2 });
  assert.deepEqual(cached, { version: 2 });
});

test("dashboard history Redis cache safely round-trips BigInt aggregates", async () => {
  const redisPath = path.resolve(__dirname, "../src/lib/redis.js");
  const cachePath = path.resolve(__dirname, "../src/services/dashboard-cache.service.js");
  const originalRedisModule = require.cache[redisPath];
  const originalCacheModule = require.cache[cachePath];
  const entries = new Map();
  const redis = {
    get: async (key) => entries.get(key) || null,
    set: async (key, value) => entries.set(key, value),
    del: async (key) => entries.delete(key),
  };
  require.cache[redisPath] = {
    id: redisPath,
    filename: redisPath,
    loaded: true,
    exports: { readyRedisClient: () => redis },
  };

  try {
    delete require.cache[cachePath];
    const firstCache = require(cachePath);
    const first = await firstCache.dashboardHistory("redis-bigint-test", async () => ({ allTimeCostRows: [{ profit: 123n }] }));
    assert.equal(first.allTimeCostRows[0].profit, 123n);
    assert.equal(
      entries.get("dukapilot:dashboard-history:redis-bigint-test"),
      JSON.stringify({ allTimeCostRows: [{ profit: "123" }] }),
    );

    delete require.cache[cachePath];
    const secondCache = require(cachePath);
    const second = await secondCache.dashboardHistory("redis-bigint-test", async () => { throw new Error("expected Redis cache hit"); });
    assert.deepEqual(second, { allTimeCostRows: [{ profit: "123" }] });
  } finally {
    if (originalCacheModule) require.cache[cachePath] = originalCacheModule;
    else delete require.cache[cachePath];
    if (originalRedisModule) require.cache[redisPath] = originalRedisModule;
    else delete require.cache[redisPath];
  }
});
