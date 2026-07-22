const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const usageControllerPath = path.resolve(__dirname, "../src/controllers/usageEvent.controller.js");
const pushControllerPath = path.resolve(__dirname, "../src/controllers/push.controller.js");

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
