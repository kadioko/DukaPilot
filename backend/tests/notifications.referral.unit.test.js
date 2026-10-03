const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const subscriptionPath = path.resolve(__dirname, "../src/middleware/subscription.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/notification.controller.js");

function loadController(prismaMock, { staff = false } = {}) {
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
  require.cache[shopAccessPath] = {
    id: shopAccessPath,
    filename: shopAccessPath,
    loaded: true,
    exports: {
      getShopIdForUser: async () => "branch-1",
      getBillingShopIdForUser: async () => staff ? null : "owner-shop-1",
    },
  };
  require.cache[subscriptionPath] = {
    id: subscriptionPath,
    filename: subscriptionPath,
    loaded: true,
    exports: { isSubscriptionActive: () => true },
  };
  delete require.cache[controllerPath];
  return require(controllerPath).list;
}

function emptyPrisma(referrals = []) {
  return {
    shop: { findUnique: async () => ({ id: "branch-1", plan: "BASIC", isActive: true }) },
    product: { findMany: async () => [] },
    debt: { findMany: async () => [] },
    customerOrder: { findMany: async () => [] },
    offlineSyncEvent: { findMany: async () => [] },
    quotation: { findMany: async () => [] },
    shopReferral: { findMany: async () => referrals },
  };
}

function response() {
  return {
    payload: null,
    json(payload) { this.payload = payload; return this; },
  };
}

test("rewarded referral appears as a durable, bilingual owner alert", async () => {
  let referralQuery;
  const referral = {
    id: "referral-1",
    rewardedAt: new Date("2026-10-02T10:00:00.000Z"),
    referredShop: { name: "Juma Shop" },
  };
  const prisma = emptyPrisma([referral]);
  prisma.shopReferral.findMany = async (args) => { referralQuery = args; return [referral]; };
  const list = loadController(prisma);
  const res = response();

  await list({ user: { userId: "owner-1", role: "MERCHANT" } }, res, (error) => { throw error; });

  assert.equal(referralQuery.where.referrerShopId, "owner-shop-1");
  assert.equal(referralQuery.where.status, "REWARDED");
  const notice = res.payload.items.find((item) => item.id === "referral-reward-referral-1");
  assert.equal(notice.title, "Referral reward confirmed");
  assert.match(notice.description, /added 7 free days/);
  assert.match(notice.descriptionSw, /siku 7 za bure/);
  assert.equal(notice.href, "/referrals");
  assert.equal(notice.createdAt, referral.rewardedAt);
});

test("staff do not receive owner referral reward alerts", async () => {
  let queriedReferrals = false;
  const prisma = emptyPrisma();
  prisma.shopReferral.findMany = async () => { queriedReferrals = true; return []; };
  const list = loadController(prisma, { staff: true });
  const res = response();

  await list({ user: { userId: "staff-user", staffId: "staff-1", role: "MERCHANT", permissions: {} } }, res, (error) => { throw error; });

  assert.equal(queriedReferrals, false);
  assert.equal(res.payload.items.some((item) => item.type === "REFERRAL_REWARD"), false);
});
