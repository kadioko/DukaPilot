const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");
const ntzs = require("../src/lib/ntzs");

const checkout = { id: "checkout-1", shopId: "shop-1", providerId: "provider-1", providerUserId: "payer-1", amount: 15000, plan: "BASIC", status: "PENDING" };
const deposit = { id: "provider-1", userId: "payer-1", amountTzs: 15000, paymentMethod: "mobile_money", status: "completed", collectToTreasury: true };

test("verified completion requires exact ID, integer amount and payment method", () => {
  assert.equal(ntzs.verifyDeposit(checkout, deposit), true);
  assert.equal(ntzs.verifyDeposit(checkout, { ...deposit, status: "minted" }), true);
  for (const patch of [{ id: "other" }, { userId: "other-payer" }, { amountTzs: "15000" }, { amountTzs: 14999 }, { paymentMethod: "card" }, { livemode: false }, { collectToTreasury: false }]) {
    assert.throws(() => ntzs.verifyDeposit(checkout, { ...deposit, ...patch }), /mismatch/);
  }
  for (const status of ["submitted", "pending", "review", "failed", "rejected"]) assert.equal(ntzs.verifyDeposit(checkout, { ...deposit, status }), false);
  assert.equal(ntzs.isDepositTerminalFailureStatus("rejected"), true);
  assert.equal(ntzs.isDepositReviewStatus("review"), true);
});

test("webhooks reject bad signatures, stale payloads and changed bodies", () => {
  const raw = Buffer.from('{"type":"deposit.completed"}');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = (time) => crypto.createHmac("sha256", "test-secret").update(`${time}.`).update(raw).digest("hex");
  assert.equal(ntzs.verifySignature(raw, timestamp, sign(timestamp), "test-secret"), true);
  assert.equal(ntzs.verifySignature(Buffer.from("{}"), timestamp, sign(timestamp), "test-secret"), false);
  assert.equal(ntzs.verifySignature(raw, timestamp, "bad", "test-secret"), false);
  assert.equal(ntzs.verifySignature(raw, timestamp, sign(timestamp), ""), false);
  const old = String(Number(timestamp) - 600);
  assert.equal(ntzs.verifySignature(raw, old, sign(old), "test-secret"), false);
});

test("renewal preserves prepaid days and clamps month end", () => {
  assert.equal(ntzs.renewalEnd({ subscriptionEndsAt: new Date("2027-01-31T12:00:00Z") }, new Date("2027-01-01")).toISOString(), "2027-02-28T12:00:00.000Z");
  assert.equal(ntzs.renewalEnd({ subscriptionEndsAt: new Date("2025-01-01") }, new Date("2026-09-06T00:00:00Z")).toISOString(), "2026-10-06T00:00:00.000Z");
});

test("online checkout stays disabled without all launch variables", () => {
  const before = { enabled: process.env.NTZS_ENABLED, key: process.env.NTZS_API_KEY, secret: process.env.NTZS_WEBHOOK_SECRET };
  try {
    process.env.NTZS_ENABLED = "false";
    assert.equal(ntzs.configured(), false);
    process.env.NTZS_ENABLED = "true";
    process.env.NTZS_API_KEY = "ntzs_test_placeholder";
    process.env.NTZS_WEBHOOK_SECRET = "placeholder";
    assert.equal(ntzs.configured(), false);
    process.env.NTZS_API_KEY = "ntzs_live_placeholder";
    process.env.NTZS_WEBHOOK_SECRET = "";
    assert.equal(ntzs.configured(), false);
  } finally {
    for (const [key, value] of Object.entries({ NTZS_ENABLED: before.enabled, NTZS_API_KEY: before.key, NTZS_WEBHOOK_SECRET: before.secret })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("online configuration tolerates secret-manager whitespace without exposing the key", () => {
  const previous = { enabled: process.env.NTZS_ENABLED, key: process.env.NTZS_API_KEY, secret: process.env.NTZS_WEBHOOK_SECRET };
  process.env.NTZS_ENABLED = "true"; process.env.NTZS_API_KEY = "ntzs_live_example\n"; process.env.NTZS_WEBHOOK_SECRET = "whsec_example\n";
  assert.equal(ntzs.configured(), true);
  process.env.NTZS_ENABLED = previous.enabled; process.env.NTZS_API_KEY = previous.key; process.env.NTZS_WEBHOOK_SECRET = previous.secret;
});

test("reconciliation activates once and never overrides suspension or pending payments", async () => {
  let current = { ...checkout };
  let shop = { id: "shop-1", isActive: true, plan: "BASIC", subscriptionEndsAt: null };
  let payments = 0;
  let updates = 0;
  let provider = { ...deposit };
  const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
  const db = {
    $queryRaw: async () => [],
    subscriptionCheckout: {
      findUnique: async () => current,
      findMany: async () => [current],
      update: async ({ data }) => (current = { ...current, ...data }),
    },
    subscriptionPayment: { create: async () => { payments++; } },
    shop: { count: async () => 0, findUnique: async () => shop, update: async ({ data }) => { updates++; shop = { ...shop, ...data }; } },
  };
  db.$transaction = async (fn) => fn(db);
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: db };
  const original = ntzs.request;
  ntzs.request = async () => provider;
  try {
    const { reconcile, reconcilePendingCheckouts, ownerOnly, publicCheckout, providerDefinitelyRejectedInitiation } = require("../src/controllers/subscriptionCheckout.controller");
    assert.equal(providerDefinitelyRejectedInitiation({ providerStatus: 400 }), true);
    assert.equal(providerDefinitelyRejectedInitiation({ providerCode: "initiation_failed" }), true);
    assert.equal(providerDefinitelyRejectedInitiation({ providerStatus: 409 }), false);
    assert.equal(providerDefinitelyRejectedInitiation({ providerStatus: 429 }), false);
    assert.equal(providerDefinitelyRejectedInitiation({ providerStatus: 503 }), false);
    provider.status = "pending";
    await reconcile(current);
    assert.equal(payments, 0);
    provider.status = "minted";
    await reconcile(current);
    await reconcile(current);
    assert.equal(payments, 1);
    assert.equal(updates, 1);
    assert.equal(current.status, "CONFIRMED");
    assert.equal(current.activeShopKey, null);
    current = { ...checkout }; shop.isActive = false;
    await reconcile(current);
    assert.equal(current.status, "REVIEW");
    assert.equal(payments, 1);
    current = { ...checkout }; shop.isActive = true; provider.status = "rejected";
    await reconcile(current);
    assert.equal(current.status, "FAILED");
    assert.equal(current.activeShopKey, null);
    assert.equal(payments, 1);
    current = { ...checkout }; provider.status = "completed";
    const sweep = await reconcilePendingCheckouts(10);
    assert.equal(sweep.checked, 1);
    assert.equal(sweep.results[0].status, "CONFIRMED");
    assert.equal(payments, 2);
    assert.equal("phone" in publicCheckout({ ...checkout, phone: "private" }), false);
    let denied;
    ownerOnly({ user: { role: "MERCHANT", staffId: "staff" } }, { status: (code) => { denied = code; return { json: () => {} }; } }, () => assert.fail("Staff allowed"));
    assert.equal(denied, 403);
  } finally { ntzs.request = original; }
});

test("review recovery reuses the original checkout for provider idempotency", async () => {
  const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
  const controllerPath = path.resolve(__dirname, "../src/controllers/subscriptionCheckout.controller.js");
  const calls = [];
  const record = { id: "11111111-1111-4111-8111-111111111111", shopId: "shop-1", phone: "+255700000001", amount: 15000, providerUserId: null };
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {
    shop: { findUnique: async () => ({ id: "shop-1", user: { name: "Amina" } }) },
    subscriptionCheckout: { update: async ({ data }) => Object.assign(record, data) },
  } };
  const original = ntzs.request;
  ntzs.request = async (url, options) => {
    calls.push({ url, options });
    return { id: calls.length === 1 ? "22222222-2222-4222-8222-222222222222" : "33333333-3333-4333-8333-333333333333" };
  };
  delete require.cache[controllerPath];
  try {
    const { initiateProviderCheckout } = require(controllerPath);
    const result = await initiateProviderCheckout(record);
    assert.equal(calls[0].options.headers["Idempotency-Key"], `payer:${record.shopId}`);
    assert.equal(JSON.parse(calls[0].options.body).externalId, `dukapilot-shop:${record.shopId}`);
    assert.equal(calls[1].options.headers["Idempotency-Key"], record.id);
    assert.equal(JSON.parse(calls[1].options.body).collectToTreasury, true);
    assert.equal(result.providerId, "33333333-3333-4333-8333-333333333333");
    assert.equal(result.status, "PENDING");
  } finally {
    ntzs.request = original;
    delete require.cache[controllerPath];
  }
});
