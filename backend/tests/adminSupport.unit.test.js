const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const subscriptionPath = path.resolve(__dirname, "../src/controllers/subscription.controller.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/adminSupport.controller.js");

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

const calls = [];
const db = {
  report: {
    count: async (args) => { calls.push(["report.count", args]); return 12; },
    findMany: async () => [],
  },
  shopReferral: { count: async () => 3 },
  supplier: { count: async () => 5 },
  loginFailureEvent: { count: async () => 7 },
  shop: {
    count: async (args) => { calls.push(["shop.count", args]); return 75; },
    findMany: async (args) => { calls.push(["shop.findMany", args]); return [{ id: "shop-1", name: "Shop One", plan: "BASIC", isActive: true, user: { name: "Owner" } }]; },
    findFirst: async () => ({ id: "shop-1" }),
    update: async ({ data }) => { calls.push(["shop.update", data]); },
  },
  subscriptionCheckout: { count: async () => 2 },
  shopSupportNote: {
    findMany: async () => [],
    create: async ({ data }) => { calls.push(["note.create", data]); return { id: "note-1", ...data }; },
  },
  auditLog: { findFirst: async () => null },
  $transaction: async (fn) => fn(db),
};

require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
require.cache[subscriptionPath] = { id: subscriptionPath, filename: subscriptionPath, loaded: true, exports: {
  subscriptionSnapshot: () => ({ computedStatus: "active", daysLeft: 20 }),
  subscriptionStatusWhere: () => ({ isActive: true }),
} };
delete require.cache[controllerPath];
const support = require(controllerPath);

test("admin summary counts all matching records and exposes only aggregate login failures", async () => {
  const res = response();
  await support.operationsSummary({}, res, (error) => { throw error; });
  assert.equal(res.payload.openReports, 12);
  assert.equal(res.payload.shopsNeedingAction, 75);
  assert.equal(res.payload.loginFailures24h, 7);
  assert.equal(Object.keys(res.payload).some((key) => /phone|pin|ip/i.test(key)), false);
  assert.equal(calls.find(([name]) => name === "shop.count")[1].where.parentShopId, null);
});

test("support list pages on the server and keeps the action filter shop scoped", async () => {
  const res = response();
  await support.listShops({ query: { page: "2", filter: "action", search: "Shop" } }, res, (error) => { throw error; });
  assert.equal(res.payload.total, 75);
  assert.equal(res.payload.totalPages, 4);
  assert.equal(res.payload.shops[0].computedStatus, "active");
  const query = calls.findLast(([name]) => name === "shop.findMany")[1];
  assert.equal(query.skip, 20);
  assert.equal(query.where.parentShopId, null);
  assert.ok(query.where.OR.length >= 5);
  assert.ok(query.where.AND.length);
});

test("support notes append in one transaction and audit metadata omits the note body", async () => {
  const req = { params: { shopId: "shop-1" }, body: { body: "Called owner about renewal" }, user: { userId: "admin-1" } };
  const res = response();
  await support.addNote(req, res, (error) => { throw error; });
  assert.equal(res.statusCode, 201);
  assert.equal(calls.findLast(([name]) => name === "note.create")[1].body, "Called owner about renewal");
  assert.equal(calls.findLast(([name]) => name === "shop.update")[1].followUpNotes, "Called owner about renewal");
  assert.deepEqual(req.audit.metadata, { noteId: "note-1" });
});
