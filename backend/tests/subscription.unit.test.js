const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { isCatalogUnpublishOnly } = require("../src/middleware/subscription");

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

test("an expired shop may only bypass billing to unpublish its public catalog", () => {
  assert.equal(isCatalogUnpublishOnly({ method: "PATCH", body: { isCatalogPublished: false } }), true);
  assert.equal(isCatalogUnpublishOnly({ method: "PATCH", body: { isCatalogPublished: true } }), false);
  assert.equal(isCatalogUnpublishOnly({ method: "PATCH", body: { isCatalogPublished: false, name: "Changed" } }), false);
  assert.equal(isCatalogUnpublishOnly({ method: "POST", body: { isCatalogPublished: false } }), false);
});

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

test("admin subscription list searches in the database and returns a bounded page with status counts", async () => {
  const countResults = [43, 2, 4, 3, 7, 19, 14, 3];
  let findManyArgs;
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      shop: {
        count: async () => countResults.shift(),
        findMany: async (args) => {
          if (args.skip !== undefined) findManyArgs = args;
          return [];
        },
      },
      sale: { groupBy: async () => [] },
    },
  };
  delete require.cache[controllerPath];
  const { adminListSubscriptions } = require(controllerPath);
  const req = { query: { page: "2", limit: "20", status: "expired", search: "salum" } };
  const res = response();
  let nextError;

  await adminListSubscriptions(req, res, (error) => { nextError = error; });

  assert.equal(nextError, undefined);
  assert.equal(findManyArgs.take, 20);
  assert.equal(findManyArgs.skip, 20);
  assert.deepEqual(res.payload, {
    shops: [],
    supportQueue: [],
    operationalCounts: { expiringTrials: 2, stalledTrials: 4, activatedTrials: 3 },
    total: 43,
    page: 2,
    limit: 20,
    totalPages: 3,
    statusCounts: { trial: 7, active: 19, expired: 14, suspended: 3 },
  });
  assert.match(JSON.stringify(findManyArgs.where), /salum/);
  assert.match(JSON.stringify(findManyArgs.where), /subscriptionEndsAt/);
});

test("subscription filters match displayed statuses including null dates and overlapping trial and paid dates", () => {
  const { subscriptionSnapshot, subscriptionStatusWhere } = require(controllerPath);
  const now = new Date("2026-11-26T12:00:00.000Z");
  const past = new Date("2026-11-25T12:00:00.000Z");
  const future = new Date("2026-11-27T12:00:00.000Z");
  function matches(shop, where) {
    return Object.entries(where).every(([key, value]) => {
      if (key === "AND") return value.every((part) => matches(shop, part));
      if (key === "OR") return value.some((part) => matches(shop, part));
      if (value && typeof value === "object" && !(value instanceof Date)) {
        return Object.entries(value).every(([op, operand]) => {
          if (op === "not") return shop[key] !== operand;
          if (op === "gt") return shop[key] != null && shop[key] > operand;
          if (op === "lte") return shop[key] != null && shop[key] <= operand;
          throw new Error(`Unexpected operator ${op}`);
        });
      }
      return shop[key] === value;
    });
  }
  for (const plan of ["FREE_TRIAL", "BASIC", "PRO"]) {
    for (const isActive of [true, false]) {
      for (const trialEndsAt of [null, past, now, future]) {
        for (const subscriptionEndsAt of [null, past, now, future]) {
          const shop = { plan, isActive, trialEndsAt, subscriptionEndsAt };
          const expected = subscriptionSnapshot(shop, now).status;
          const found = ["trial", "active", "expired", "suspended"].filter((status) => matches(shop, subscriptionStatusWhere(status, now)));
          assert.deepEqual(found, [expected], JSON.stringify(shop));
        }
      }
    }
  }
});
