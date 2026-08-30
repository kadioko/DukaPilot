const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const authPath = path.resolve(__dirname, "../src/controllers/auth.controller.js");
const referralPath = path.resolve(__dirname, "../src/controllers/referral.controller.js");

function mockPrisma(prismaMock) {
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    getHeader(name) { return this.headers[name]; },
    setHeader(name, value) { this.headers[name] = value; },
  };
}

test("merchant registration records the shop that supplied a valid referral link", async () => {
  process.env.JWT_SECRET = "referral-test-secret";
  let createdShop;
  mockPrisma({
    user: {
      findUnique: async ({ where }) => where.phone ? null : {
        id: "merchant-2",
        phone: "+255700000010",
        name: "Referred owner",
        role: "MERCHANT",
        language: "en",
        shop: { id: "shop-2", name: "Referred shop", plan: "FREE_TRIAL", isActive: true },
      },
      create: async () => ({ id: "merchant-2", phone: "+255700000010", name: "Referred owner", role: "MERCHANT" }),
    },
    staffMember: { findUnique: async () => null },
    shop: {
      findUnique: async ({ where }) => where.referralCode === "DP-S-REFERRER" ? { id: "shop-referrer", referralCode: "DP-S-REFERRER" } : null,
      create: async ({ data }) => { createdShop = data; return { id: "shop-2", ...data }; },
    },
  });
  delete require.cache[authPath];
  const { register } = require(authPath);
  const res = response();

  await register({ body: { phone: "+255700000010", pin: "1234", name: "Referred owner", role: "MERCHANT", referralCode: "dp-s-referrer" } }, res, (error) => { throw error; });

  assert.equal(res.statusCode, 201);
  assert.equal(createdShop.referralCode, "DP-U-MERCHANT-2");
  assert.deepEqual(createdShop.referralReceived, {
    create: { referrerShopId: "shop-referrer", referralCode: "DP-S-REFERRER" },
  });
});

test("admin referral reward extends an active paid subscription once", async () => {
  let referralUpdate;
  let shopUpdate;
  const tx = {
    shopReferral: {
      findUnique: async () => ({
        id: "referral-1",
        status: "QUALIFIED",
        qualifiedAt: new Date("2026-08-20T00:00:00.000Z"),
        referrerShopId: "shop-referrer",
        referredShopId: "shop-referred",
        referrerShop: {
          id: "shop-referrer",
          name: "Amina Shop",
          plan: "BASIC",
          trialEndsAt: null,
          subscriptionEndsAt: new Date("2030-01-10T00:00:00.000Z"),
          isActive: true,
        },
        referredShop: { id: "shop-referred", name: "Juma Shop" },
      }),
      updateMany: async ({ data }) => { referralUpdate = data; return { count: 1 }; },
    },
    sale: { count: async () => 10 },
    shop: {
      update: async ({ data }) => {
        shopUpdate = data;
        return { id: "shop-referrer", name: "Amina Shop", plan: "BASIC", subscriptionEndsAt: data.subscriptionEndsAt, isActive: true };
      },
    },
  };
  mockPrisma({ $transaction: async (callback) => callback(tx) });
  delete require.cache[referralPath];
  const { adminRewardReferral } = require(referralPath);
  const res = response();
  const req = { params: { referralId: "referral-1" }, body: {}, user: { userId: "admin-1" } };

  await adminRewardReferral(req, res, (error) => { throw error; });

  assert.equal(res.statusCode, 200);
  assert.equal(referralUpdate.status, "REWARDED");
  assert.equal(referralUpdate.rewardedBy, "admin-1");
  assert.equal(shopUpdate.subscriptionEndsAt.toISOString(), "2030-01-17T00:00:00.000Z");
  assert.equal(req.audit.action, "admin.referral.rewarded");
});

test("admin can recover a missing referral without bypassing qualification", async () => {
  let createdReferral;
  const tx = {
    shop: {
      findUnique: async () => ({ id: "shop-referrer", name: "Amina Shop", referralCode: "DP-S-REFERRER" }),
    },
    user: {
      findFirst: async () => ({ id: "owner-referred", shop: { id: "shop-referred", name: "Juma Shop" } }),
    },
    shopReferral: {
      findUnique: async () => null,
      create: async ({ data }) => { createdReferral = data; return { id: "recovered-1", ...data }; },
    },
    sale: { count: async () => 4 },
  };
  mockPrisma({ $transaction: async (callback) => callback(tx) });
  delete require.cache[referralPath];
  const { adminRecoverReferral } = require(referralPath);
  const res = response();
  const req = {
    body: { referralCode: "dp-s-referrer", referredPhone: "0712345678", note: "Owner confirmed the shared referral link" },
    user: { userId: "admin-1" },
  };

  await adminRecoverReferral(req, res, (error) => { throw error; });

  assert.equal(res.statusCode, 201);
  assert.equal(createdReferral.referrerShopId, "shop-referrer");
  assert.equal(createdReferral.referredShopId, "shop-referred");
  assert.equal(createdReferral.status, "PENDING");
  assert.match(createdReferral.note, /^Recovered by admin:/);
  assert.equal(req.audit.action, "admin.referral.recovered");
});

test("shop owners can read only their own referral link and progress", async () => {
  mockPrisma({
    shop: {
      findUnique: async ({ where }) => where.userId
        ? { id: "shop-owner" }
        : { id: "shop-owner", referralCode: "DP-S-SHOP-OWNER", referralsMade: [] },
    },
  });
  delete require.cache[shopAccessPath];
  delete require.cache[referralPath];
  const { getMyReferrals } = require(referralPath);
  const res = response();

  await getMyReferrals({ user: { userId: "owner-1", role: "MERCHANT" } }, res, (error) => { throw error; });

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.referralCode, "DP-S-SHOP-OWNER");
  assert.deepEqual(res.payload.referrals, []);
});

test("staff cannot view the shop owner's referral rewards", async () => {
  mockPrisma({});
  delete require.cache[referralPath];
  const { getMyReferrals } = require(referralPath);
  const res = response();

  await getMyReferrals({ user: { userId: "owner-1", staffId: "staff-1", role: "MERCHANT" } }, res, (error) => { throw error; });

  assert.equal(res.statusCode, 403);
});
