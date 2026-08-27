const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/subscription.controller.js");

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("admin support access reactivates an expired shop on a paid plan", async () => {
  let updateData;
  const expiredAt = new Date("2026-07-01T00:00:00.000Z");
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      shop: {
        findUnique: async () => ({ id: "shop-1", name: "Salum Pharmacy", plan: "FREE_TRIAL", subscriptionEndsAt: expiredAt }),
        update: async ({ data }) => {
          updateData = data;
          return { id: "shop-1", name: "Salum Pharmacy", plan: data.plan, trialEndsAt: expiredAt, subscriptionEndsAt: data.subscriptionEndsAt, isActive: data.isActive };
        },
      },
    },
  };
  delete require.cache[controllerPath];
  const { adminExtendSubscription } = require(controllerPath);
  const req = { params: { shopId: "shop-1" }, body: { days: 30 }, user: { userId: "admin-1" } };
  const res = response();
  let nextError;

  await adminExtendSubscription(req, res, (error) => { nextError = error; });

  assert.equal(nextError, undefined);
  assert.equal(res.statusCode, 200);
  assert.equal(updateData.plan, "BASIC");
  assert.equal(updateData.isActive, true);
  assert.ok(updateData.subscriptionEndsAt > new Date());
  assert.equal(res.payload.active, true);
});
