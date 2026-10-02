const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { parseTanzaniaDate, parseTanzaniaRange } = require("../src/controllers/branch.controller");

test("branch report date-only bounds cover full Tanzania calendar days", () => {
  const range = parseTanzaniaRange("2026-10-01", "2026-10-02");
  assert.equal(range.from.toISOString(), "2026-09-30T21:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-10-02T21:00:00.000Z");
});

test("branch report date parser rejects impossible or reversed dates", () => {
  assert.equal(parseTanzaniaDate("2026-02-30"), null);
  assert.throws(() => parseTanzaniaRange("2026-10-03", "2026-10-02"), /valid date range/);
});

test("branch overview binds shop IDs and date bounds safely and returns combined comparisons", async () => {
  const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
  const accessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
  const entitlementPath = path.resolve(__dirname, "../src/lib/entitlements.js");
  const controllerPath = path.resolve(__dirname, "../src/controllers/branch.controller.js");
  const rawCalls = [];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {
    shop: { findUnique: async () => ({ id: "main" }), findMany: async () => [{ id: "main", name: "Main", location: "Dar", branchArchived: false }] },
    sale: { groupBy: async () => [] }, expense: { groupBy: async () => [] }, debt: { groupBy: async () => [] },
    $queryRawUnsafe: async (query, ...params) => { rawCalls.push({ query, params }); return []; },
  } };
  require.cache[accessPath] = { id: accessPath, filename: accessPath, loaded: true, exports: { getBillingShopIdForUser: async () => "main" } };
  require.cache[entitlementPath] = { id: entitlementPath, filename: entitlementPath, loaded: true, exports: { activePlan: () => "PRO" } };
  delete require.cache[controllerPath];
  const controller = require(controllerPath);
  const res = { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
  await controller.overview({ user: { userId: "owner" }, query: { from: "2026-10-01", to: "2026-10-02" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.totals.sales, 0);
  assert.equal(res.payload.comparison.netProfit.change, 0);
  assert.match(rawCalls[0].query, /IN \(\$1\)/);
  assert.equal(rawCalls[0].params[0], "main");
  assert.equal(rawCalls[0].params[1].toISOString(), "2026-09-30T21:00:00.000Z");
  assert.equal(rawCalls[0].params[2].toISOString(), "2026-10-02T21:00:00.000Z");
});
