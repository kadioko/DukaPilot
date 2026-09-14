const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const jwt = require("jsonwebtoken");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const authPath = path.resolve(__dirname, "../src/middleware/auth.js");
const subscriptionPath = path.resolve(__dirname, "../src/middleware/subscription.js");
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
    user: { findUnique: async () => ({ id: "owner-1", role: "MERCHANT", sessionVersion: 1 }) },
    staffMember: {
      findFirst: async () => ({
        id: "staff-1",
        sessionVersion: 1,
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
  const token = jwt.sign({ userId: "owner-1", role: "MERCHANT", staffId: "staff-1", sessionVersion: 1, permissions: { canSell: true } }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = response();
  let nextCalled = false;

  await authenticate(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(req.user.shopId, "shop-1");
  assert.equal(req.user.permissions.canSell, false);
  assert.equal(req.user.permissions.canManageStock, true);
});

test("staff of an admin-owned shop cannot inherit platform-admin access", async () => {
  process.env.JWT_SECRET = "hardening-test-secret";
  mockPrisma({
    user: { findUnique: async () => ({ id: "admin-owner", role: "ADMIN", sessionVersion: 1 }) },
    staffMember: {
      findFirst: async () => ({
        id: "cashier-1", sessionVersion: 1, role: "CASHIER", shopId: "shop-1",
        canSell: true, canManageStock: false, canManageStaff: false, canViewReports: false,
        shop: { userId: "admin-owner", parentShopId: null, branchArchived: false, parentShop: null },
      }),
    },
  });
  delete require.cache[authPath];
  const { authenticate, requireRole, requirePermission } = require(authPath);
  const token = jwt.sign({ userId: "admin-owner", role: "ADMIN", staffId: "cashier-1", sessionVersion: 1 }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const authRes = response();
  await authenticate(req, authRes, () => {});

  assert.equal(req.user.role, "MERCHANT");
  assert.equal(req.user.accountRole, "ADMIN");

  const adminRes = response();
  requireRole("ADMIN")(req, adminRes, () => assert.fail("staff reached platform admin route"));
  assert.equal(adminRes.statusCode, 403);

  const staffRes = response();
  requirePermission("canManageStaff")(req, staffRes, () => assert.fail("cashier managed staff"));
  assert.equal(staffRes.statusCode, 403);
});

test("authenticate rejects a session issued before the account session version changed", async () => {
  process.env.JWT_SECRET = "hardening-test-secret";
  mockPrisma({ user: { findUnique: async () => ({ id: "owner-1", role: "MERCHANT", sessionVersion: 3 }) } });
  delete require.cache[authPath];
  const { authenticate } = require(authPath);
  const token = jwt.sign({ userId: "owner-1", role: "MERCHANT", sessionVersion: 2 }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = response();
  let nextCalled = false;
  await authenticate(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.error, "Session expired");
});

test("branch writes use the current root-business subscription instead of stale child billing fields", async () => {
  require.cache[shopAccessPath] = {
    id: shopAccessPath,
    filename: shopAccessPath,
    loaded: true,
    exports: {
      getShopIdForUser: async () => "branch-1",
      getBillingShopIdForUser: async () => "root-1",
    },
  };
  mockPrisma({
    shop: {
      findUnique: async ({ where }) => where.id === "branch-1"
        ? { id: "branch-1", parentShopId: "root-1", branchArchived: false }
        : { id: "root-1", plan: "PRO", isActive: true, trialEndsAt: null, subscriptionEndsAt: new Date(Date.now() + 86400000) },
    },
  });
  delete require.cache[subscriptionPath];
  const { requireActiveSubscription } = require(subscriptionPath);
  await new Promise((resolve, reject) => {
    requireActiveSubscription(
      { method: "POST", user: { userId: "owner-1", role: "MERCHANT" } },
      { status: () => ({ json: (payload) => reject(new Error(payload.error)) }) },
      (error) => error ? reject(error) : resolve(),
    );
  });
});

test("subscription enforcement also protects PUT updates", async () => {
  require.cache[shopAccessPath] = {
    id: shopAccessPath,
    filename: shopAccessPath,
    loaded: true,
    exports: {
      getShopIdForUser: async () => "shop-1",
      getBillingShopIdForUser: async () => "shop-1",
    },
  };
  mockPrisma({
    shop: {
      findUnique: async () => ({
        id: "shop-1",
        name: "Expired Business",
        plan: "BASIC",
        isActive: true,
        trialEndsAt: null,
        subscriptionEndsAt: new Date(Date.now() - 86400000),
        parentShopId: null,
        branchArchived: false,
      }),
    },
  });
  delete require.cache[subscriptionPath];
  const { requireActiveSubscription } = require(subscriptionPath);
  await new Promise((resolve, reject) => {
    requireActiveSubscription(
      { method: "PUT", user: { userId: "owner-1", role: "MERCHANT" } },
      {
        status(code) {
          try {
            assert.equal(code, 402);
          } catch (error) {
            reject(error);
          }
          return {
            json(payload) {
              try {
                assert.equal(payload.code, "SUBSCRIPTION_REQUIRED");
                resolve();
              } catch (error) {
                reject(error);
              }
            },
          };
        },
      },
      (error) => error ? reject(error) : reject(new Error("Expired shop reached a PUT handler")),
    );
  });
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

test("Basic includes one-staff capability while Pro and trial add AI access", () => {
  const { canUseFeature } = require("../src/lib/entitlements");
  const future = new Date(Date.now() + 86400000);

  assert.equal(canUseFeature({ plan: "BASIC", subscriptionEndsAt: future, isActive: true }, "STAFF"), true);
  assert.equal(canUseFeature({ plan: "BASIC", subscriptionEndsAt: future, isActive: true }, "EXPORTS"), true);
  assert.equal(canUseFeature({ plan: "BASIC", subscriptionEndsAt: future, isActive: true }, "ASSISTANT"), false);
  assert.equal(canUseFeature({ plan: "PRO", subscriptionEndsAt: future, isActive: true }, "ASSISTANT"), true);
  assert.equal(canUseFeature({ plan: "FREE_TRIAL", trialEndsAt: future, isActive: true }, "STAFF"), true);
});

test("public quotation tokens are redacted before they reach logs or audit paths", () => {
  const { redactPublicQuotationToken } = require("../src/lib/redaction");
  const value = "/api/public/quotations/very-secret-token?download=1";
  assert.equal(redactPublicQuotationToken(value), "/api/public/quotations/[token]?download=1");
});

test("merchants cannot invoke the global push delivery worker", () => {
  const fs = require("node:fs");
  const routeSource = fs.readFileSync(path.resolve(__dirname, "../src/routes/push.routes.js"), "utf8");
  assert.doesNotMatch(routeSource, /post\(\s*["']\/process/);
});
