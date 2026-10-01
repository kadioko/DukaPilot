const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const prisma = require("../src/lib/prisma");
const { customerGroups, customerDebtHistory } = require("../src/controllers/debt.controller");

const databaseUrl = String(process.env.DATABASE_URL || "");
if (!/localhost|127\.0\.0\.1|dukapilot_test/i.test(databaseUrl)) {
  throw new Error("Debt customer integration tests require a local test database");
}

test.after(async () => prisma.$disconnect());

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(body) { this.payload = body; return this; } };
}

async function invoke(handler, req) {
  const res = response();
  await new Promise((resolve, reject) => handler(req, { ...res, json(body) { res.payload = body; resolve(); return this; }, status(code) { res.statusCode = code; return this; } }, reject));
  return res;
}

test("customer pages merge older phone formats and keep paid history separate", async (t) => {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({ data: { phone: `debt-page-${suffix}`, pin: "test-only", name: "Debt page test" } });
  const shop = await prisma.shop.create({ data: { userId: user.id, name: "Debt page test", location: "Test", referralCode: `debt-page-${suffix}` } });
  t.after(async () => {
    await prisma.shop.delete({ where: { id: shop.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  await prisma.debt.createMany({ data: [
    { shopId: shop.id, customerName: "Asha", customerPhone: "0712345678", amount: 5000 },
    { shopId: shop.id, customerName: "Asha", customerPhone: "+255712345678", amount: 3000, amountPaid: 1000, status: "PARTIAL" },
    { shopId: shop.id, customerName: "Paid customer", customerPhone: "+255700000099", amount: 2000, amountPaid: 2000, status: "PAID" },
    ...Array.from({ length: 26 }, (_, index) => ({ shopId: shop.id, customerName: `Customer ${index}`, customerPhone: `+255700000${String(index).padStart(3, "0")}`, amount: 1000 })),
  ] });
  const userContext = { userId: user.id };
  const first = await invoke(customerGroups, { user: userContext, query: { page: "1", limit: "25", filter: "OUTSTANDING" } });
  const second = await invoke(customerGroups, { user: userContext, query: { page: "2", limit: "25", filter: "OUTSTANDING" } });
  assert.equal(first.payload.customers.length, 25);
  assert.equal(first.payload.pagination.hasMore, true);
  assert.equal(second.payload.customers.length, 2);
  assert.equal(second.payload.pagination.hasMore, false);

  const search = await invoke(customerGroups, { user: userContext, query: { search: "0712345678", filter: "OUTSTANDING" } });
  assert.equal(search.payload.customers.length, 1);
  assert.equal(search.payload.customers[0].phone, "+255712345678");
  assert.equal(search.payload.customers[0].outstanding, 7000);
  assert.equal(search.payload.customers[0].debtCount, 2);
  const paid = await invoke(customerGroups, { user: userContext, query: { filter: "PAID" } });
  assert.equal(paid.payload.customers.length, 1);
  assert.equal(paid.payload.customers[0].phone, "+255700000099");

  const historyFirst = await invoke(customerDebtHistory, { user: userContext, params: { phone: "+255712345678" }, query: { limit: "1", page: "1" } });
  const historySecond = await invoke(customerDebtHistory, { user: userContext, params: { phone: "+255712345678" }, query: { limit: "1", page: "2" } });
  assert.equal(historyFirst.payload.debts.length, 1);
  assert.equal(historyFirst.payload.pagination.hasMore, true);
  assert.equal(historySecond.payload.debts.length, 1);
  assert.equal(historySecond.payload.pagination.hasMore, false);
});
