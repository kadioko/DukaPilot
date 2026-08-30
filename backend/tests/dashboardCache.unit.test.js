const test = require("node:test");
const assert = require("node:assert/strict");

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
