const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const jwt = require("jsonwebtoken");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const authPath = path.resolve(__dirname, "../src/middleware/auth.js");
const customerOrderPath = path.resolve(__dirname, "../src/controllers/customerOrder.controller.js");

function mockPrisma(prismaMock) {
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("authenticate refreshes staff permissions from the database", async () => {
  process.env.JWT_SECRET = "hardening-test-secret";
  mockPrisma({
    staffMember: {
      findFirst: async () => ({
        id: "staff-1",
        shopId: "shop-1",
        canSell: false,
        canManageStock: true,
        canManageStaff: false,
        canViewReports: false,
        shop: { userId: "owner-1" },
      }),
    },
  });
  delete require.cache[authPath];
  const { authenticate } = require(authPath);
  const token = jwt.sign({ userId: "owner-1", role: "MERCHANT", staffId: "staff-1", permissions: { canSell: true } }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = response();
  let nextCalled = false;

  await authenticate(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.user.shopId, "shop-1");
  assert.equal(req.user.permissions.canSell, false);
  assert.equal(req.user.permissions.canManageStock, true);
});

test("customer orders reject skipping directly from pending to delivered", async () => {
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    customerOrder: {
      findFirst: async () => ({ id: "order-1", status: "PENDING", items: [] }),
    },
  };
  mockPrisma(prismaMock);
  delete require.cache[shopAccessPath];
  delete require.cache[customerOrderPath];
  const controller = require(customerOrderPath);
  const req = { user: { userId: "owner-1" }, params: { id: "order-1" }, body: { status: "DELIVERED" } };
  const res = response();

  await controller.updateStatus(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /Cannot move customer order from PENDING to DELIVERED/);
});

test("customer order confirmation detects a concurrent status change", async () => {
  const prismaMock = {
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    customerOrder: {
      findFirst: async () => ({ id: "order-1", status: "PENDING", items: [] }),
    },
    $transaction: async (fn) => fn({
      customerOrder: { updateMany: async () => ({ count: 0 }) },
    }),
  };
  mockPrisma(prismaMock);
  delete require.cache[shopAccessPath];
  delete require.cache[customerOrderPath];
  const controller = require(customerOrderPath);
  const req = { user: { userId: "owner-1" }, params: { id: "order-1" }, body: { status: "CONFIRMED" } };
  const res = response();
  let caught;

  await controller.updateStatus(req, res, (error) => { caught = error; });

  assert.equal(caught.status, 409);
  assert.match(caught.message, /status changed/);
});

test("Tanzania business-day boundaries use UTC+3", () => {
  const { startOfTanzaniaDay, startOfTanzaniaMonth, tanzaniaDateKey } = require("../src/lib/businessTime");
  const instant = new Date("2026-07-10T22:30:00.000Z");

  assert.equal(tanzaniaDateKey(instant), "2026-07-11");
  assert.equal(startOfTanzaniaDay(instant).toISOString(), "2026-07-10T21:00:00.000Z");
  assert.equal(startOfTanzaniaMonth(instant).toISOString(), "2026-06-30T21:00:00.000Z");
});

test("Basic and Pro entitlements are distinct while trial keeps full access", () => {
  const { canUseFeature } = require("../src/lib/entitlements");
  const future = new Date(Date.now() + 86400000);

  assert.equal(canUseFeature({ plan: "BASIC", subscriptionEndsAt: future, isActive: true }, "STAFF"), false);
  assert.equal(canUseFeature({ plan: "BASIC", subscriptionEndsAt: future, isActive: true }, "EXPORTS"), true);
  assert.equal(canUseFeature({ plan: "PRO", subscriptionEndsAt: future, isActive: true }, "ASSISTANT"), true);
  assert.equal(canUseFeature({ plan: "FREE_TRIAL", trialEndsAt: future, isActive: true }, "STAFF"), true);
});
