const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const usageControllerPath = path.resolve(__dirname, "../src/controllers/usageEvent.controller.js");
const pushControllerPath = path.resolve(__dirname, "../src/controllers/push.controller.js");
const pushServicePath = path.resolve(__dirname, "../src/services/push.service.js");
const webPushPath = require.resolve("web-push");

function mockPrisma(prismaMock) {
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
}

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

test("shortcut analytics rejects anonymous-shaped or cross-route events", async () => {
  mockPrisma({ shop: { findUnique: async () => ({ id: "shop-a" }) } });
  delete require.cache[shopAccessPath];
  delete require.cache[usageControllerPath];
  const controller = require(usageControllerPath);
  const res = response();
  await controller.create({ user: { userId: "owner-a", role: "MERCHANT" }, body: { eventName: "android_shortcut_opened", action: "sale", route: "/inventory", deviceId: "device-12345678" } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /Invalid usage event/);
});

test("shortcut analytics is recorded only against the authenticated shop", async () => {
  let created;
  mockPrisma({
    shop: { findUnique: async () => ({ id: "shop-a" }) },
    appUsageEvent: { findFirst: async () => null, create: async ({ data }) => { created = data; return data; } },
  });
  delete require.cache[shopAccessPath];
  delete require.cache[usageControllerPath];
  const controller = require(usageControllerPath);
  const res = response();
  await controller.create({ user: { userId: "owner-a", role: "MERCHANT" }, body: { eventName: "android_shortcut_opened", action: "sale", route: "/sales", deviceId: "device-12345678" } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(created.shopId, "shop-a");
  assert.equal(created.route, "/sales");
});

test("push subscription rejects incomplete browser subscription data", async () => {
  mockPrisma({ shop: { findUnique: async () => ({ id: "shop-a" }) }, pushSubscription: { updateMany: async () => ({ count: 0 }) } });
  delete require.cache[shopAccessPath];
  delete require.cache[pushControllerPath];
  const controller = require(pushControllerPath);
  const res = response();
  await controller.subscribe({ user: { userId: "owner-a", role: "MERCHANT" }, body: { endpoint: "https://push.example", deviceId: "device-12345678", keys: {} } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.payload.error, /valid device subscription/);
});

test("push config reads the VAPID key from the Node environment", async () => {
  const previousPublicKey = process.env.VAPID_PUBLIC_KEY;
  process.env.VAPID_PUBLIC_KEY = "test-public-key";
  try {
    mockPrisma({});
    delete require.cache[pushControllerPath];
    const controller = require(pushControllerPath);
    const res = response();

    await controller.config({}, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.publicKey, "test-public-key");
  } finally {
    if (previousPublicKey === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = previousPublicKey;
  }
});

test("push subscription saves a valid browser device for the authenticated shop", async () => {
  let saved;
  mockPrisma({
    shop: { findUnique: async () => ({ id: "shop-a" }) },
    pushSubscription: {
      updateMany: async () => ({ count: 0 }),
      upsert: async ({ create }) => {
        saved = create;
        return create;
      },
    },
  });
  delete require.cache[shopAccessPath];
  delete require.cache[pushControllerPath];
  const controller = require(pushControllerPath);
  const res = response();

  await controller.subscribe({
    user: { userId: "owner-a", role: "MERCHANT" },
    body: {
      endpoint: "https://push.example/subscription",
      keys: { p256dh: "public-key", auth: "auth-key" },
      deviceId: "device-12345678",
      deviceLabel: "Android phone",
    },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(saved.shopId, "shop-a");
  assert.equal(saved.deviceId, "device-12345678");
  assert.equal(res.payload.message, "Device alerts enabled");
});

test("shop owners can save one alert preference without changing the others", async () => {
  let saved;
  mockPrisma({
    shop: { findUnique: async () => ({ id: "shop-a" }) },
    notificationPreference: {
      upsert: async ({ update }) => {
        saved = update;
        return { shopId: "shop-a", lowStock: false, debtDue: true, subscriptionExpiry: true, dailyAssistant: false };
      },
    },
  });
  delete require.cache[shopAccessPath];
  delete require.cache[pushControllerPath];
  const controller = require(pushControllerPath);
  const res = response();

  await controller.updatePreferences({ user: { userId: "owner-a", role: "MERCHANT" }, body: { lowStock: false, unexpected: true } }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(saved, { lowStock: false });
  assert.equal(res.payload.preferences.lowStock, false);
  assert.equal(res.payload.preferences.debtDue, true);
});

test("staff delivery history is limited to their device and permitted alert kinds", async () => {
  let deliveryWhere;
  mockPrisma({
    shop: { findUnique: async () => ({ id: "shop-a" }) },
    pushDelivery: { findMany: async ({ where }) => { deliveryWhere = where; return []; } },
  });
  delete require.cache[shopAccessPath];
  delete require.cache[pushControllerPath];
  const controller = require(pushControllerPath);
  const res = response();

  await controller.listDeliveries({ user: { userId: "owner-a", staffId: "stock-1", shopId: "shop-a", permissions: { canManageStock: true } } }, res);

  assert.equal(deliveryWhere.shopId, "shop-a");
  assert.equal(deliveryWhere.subscription.staffId, "stock-1");
  assert.deepEqual(deliveryWhere.kind.in, ["LOW_STOCK"]);
});

test("shop alert queue excludes staff who lack permission for its content", async () => {
  let queued;
  mockPrisma({
    pushSubscription: { findMany: async () => [
      { id: "owner-device", staffId: null },
      { id: "stock-device", staffId: "stock-1" },
      { id: "cashier-device", staffId: "cashier-1" },
    ] },
    staffMember: { findMany: async () => [
      { id: "stock-1", isActive: true, canManageStock: true, canViewReports: false, canViewQuotations: false, canUseAssistant: false },
      { id: "cashier-1", isActive: true, canManageStock: false, canViewReports: false, canViewQuotations: false, canUseAssistant: false },
    ] },
    pushDelivery: { createMany: async ({ data }) => { queued = data; return { count: data.length }; } },
  });
  delete require.cache[pushServicePath];
  const { queueForShop } = require(pushServicePath);
  const result = await queueForShop("shop-a", "LOW_STOCK", { title: "Stock", body: "Details", href: "/inventory" });

  assert.equal(result, true);
  assert.deepEqual(queued.map((item) => item.subscriptionId), ["owner-device", "stock-device"]);
});

test("push worker claims a delivery and does not deactivate a valid device after transient retry exhaustion", async () => {
  process.env.VAPID_PUBLIC_KEY = "public";
  process.env.VAPID_PRIVATE_KEY = "private";
  process.env.VAPID_SUBJECT = "mailto:test@example.test";
  let claimData;
  let finalDeliveryData;
  let subscriptionData;
  require.cache[webPushPath] = { id: webPushPath, filename: webPushPath, loaded: true, exports: {
    setVapidDetails() {},
    async sendNotification() { throw Object.assign(new Error("Temporary provider error"), { statusCode: 503 }); },
  } };
  mockPrisma({
    pushDelivery: {
      findMany: async () => [{ id: "delivery-1", status: "RETRYING", kind: "LOW_STOCK", title: "Stock", body: "Details", href: "/inventory", attemptCount: 4, leaseExpiresAt: null, subscription: { id: "sub-1", isActive: true, endpoint: "https://push.example/1", p256dh: "p", auth: "a" }, shop: { notificationPreference: { lowStock: true, privatePreview: true } } }],
      updateMany: async ({ data }) => { claimData = data; return { count: 1 }; },
      update: async ({ data }) => { finalDeliveryData = data; return {}; },
    },
    pushSubscription: { update: async ({ data }) => { subscriptionData = data; return {}; } },
    $transaction: async (operations) => Promise.all(operations),
  });
  delete require.cache[pushServicePath];
  const { processPushDeliveries } = require(pushServicePath);
  const result = await processPushDeliveries(10);
  assert.equal(claimData.status, "SENDING");
  assert.equal(finalDeliveryData.status, "FAILED");
  assert.equal(subscriptionData.isActive, undefined);
  assert.equal(result.failed, 1);
});
