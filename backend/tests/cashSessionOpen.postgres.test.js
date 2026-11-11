const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const database = new URL(process.env.DATABASE_URL || "postgresql://invalid");
if (!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/dukapilot_test")) {
  throw new Error("Cash-session open tests require a local dukapilot_test database");
}

const prisma = require("../src/lib/prisma");
const cashSessions = require("../src/controllers/cashSession.controller");
test.after(async () => prisma.$disconnect());

async function invoke(req) {
  const res = { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return this; } };
  await cashSessions.open(req, res, (error) => res.status(error.status || 500).json({ error: error.message }));
  return res;
}

async function fixture(t) {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({ data: { phone: `cash-open-${suffix}`, pin: "test-only", name: "Synthetic cashier" } });
  const shop = await prisma.shop.create({ data: { userId: user.id, name: "Synthetic cash shift", location: "Test", referralCode: suffix } });
  t.after(async () => {
    await prisma.shop.deleteMany({ where: { id: shop.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });
  return { shop, user, actor: { userId: user.id, role: "MERCHANT" } };
}

test("concurrent retries of the same shift-open key create one session and replay the same result", { timeout: 15000 }, async (t) => {
  const { shop, user, actor } = await fixture(t);
  const clientRequestId = crypto.randomUUID();
  const req = { user: actor, body: { openingCash: 12000, note: "Morning", clientRequestId }, requestPhaseTimings: {} };
  const results = await Promise.all([invoke(req), invoke({ ...req, requestPhaseTimings: {} })]);

  assert.deepEqual(results.map((result) => result.statusCode).sort(), [200, 201]);
  assert.equal(results[0].payload.session.id, results[1].payload.session.id);
  assert.equal("openRequestId" in results[0].payload.session, false);
  assert.equal("openRequestHash" in results[0].payload.session, false);
  const saved = await prisma.cashSession.findMany({ where: { shopId: shop.id, openedById: `user:${user.id}`, openRequestId: clientRequestId } });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].openingCash, 12000);
});

test("concurrent distinct opens by the same actor cannot create two open drawers", { timeout: 15000 }, async (t) => {
  const { shop, actor } = await fixture(t);
  const results = await Promise.all([
    invoke({ user: actor, body: { openingCash: 1000, clientRequestId: crypto.randomUUID() }, requestPhaseTimings: {} }),
    invoke({ user: actor, body: { openingCash: 2000, clientRequestId: crypto.randomUUID() }, requestPhaseTimings: {} }),
  ]);

  assert.deepEqual(results.map((result) => result.statusCode).sort(), [201, 409]);
  assert.equal(await prisma.cashSession.count({ where: { shopId: shop.id, status: "OPEN" } }), 1);
});
