const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const controllerPath = path.resolve(__dirname, "../src/controllers/settings.controller.js");
const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const entitlementsPath = path.resolve(__dirname, "../src/lib/entitlements.js");
const cloudflareAiPath = path.resolve(__dirname, "../src/services/cloudflareAi.service.js");
const paths = [controllerPath, prismaPath, shopAccessPath, entitlementsPath, cloudflareAiPath];

function cacheModule(id, exports) {
  return { id, filename: id, loaded: true, exports };
}

function loadController({ shop, configured = true, feature = true } = {}) {
  const previous = new Map(paths.map((file) => [file, require.cache[file]]));
  const updates = [];
  require.cache[prismaPath] = cacheModule(prismaPath, {
    shop: {
      findUnique: async () => shop,
      update: async (args) => {
        updates.push(args);
        Object.assign(shop, args.data);
        return { externalAiEnabled: shop.externalAiEnabled, externalAiConsentAt: shop.externalAiConsentAt };
      },
    },
  });
  require.cache[shopAccessPath] = cacheModule(shopAccessPath, { getBillingShopIdForUser: async () => "business-1" });
  require.cache[entitlementsPath] = cacheModule(entitlementsPath, { canUseFeature: () => feature });
  require.cache[cloudflareAiPath] = cacheModule(cloudflareAiPath, { SHOP_DAILY_LIMIT: 10, CONSENT_VERSION: "test-consent-v1", isConfigured: () => configured });
  delete require.cache[controllerPath];
  return {
    controller: require(controllerPath),
    updates,
    restore() {
      for (const file of paths) {
        if (previous.get(file)) require.cache[file] = previous.get(file);
        else delete require.cache[file];
      }
    },
  };
}

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(body) { this.payload = body; return this; } };
}

function shop(overrides = {}) {
  return { id: "business-1", userId: "owner-1", parentShopId: null, plan: "PRO", subscriptionEndsAt: new Date(Date.now() + 86400000), externalAiEnabled: false, externalAiConsentAt: null, externalAiConsentVersion: null, ...overrides };
}

test("external AI consent can only be managed by the primary merchant owner", async () => {
  const harness = loadController({ shop: shop() });
  try {
    const staff = response();
    await harness.controller.updateExternalAiConsent({ user: { role: "MERCHANT", userId: "owner-1", staffId: "staff-1" }, body: { enabled: true } }, staff);
    assert.equal(staff.statusCode, 403);

    const wrongOwner = response();
    await harness.controller.updateExternalAiConsent({ user: { role: "MERCHANT", userId: "other-owner" }, body: { enabled: true } }, wrongOwner);
    assert.equal(wrongOwner.statusCode, 403);

    const branch = response();
    await harness.controller.updateExternalAiConsent({ user: { role: "MERCHANT", userId: "owner-1" }, body: { enabled: true } }, branch);
    assert.equal(branch.statusCode, 200);
    assert.equal(branch.payload.externalAi.enabled, true);
    assert.equal(harness.updates[0].where.id, "business-1");
    assert.equal(harness.updates[0].data.externalAiConsentVersion, "test-consent-v1");
    assert.ok(harness.updates[0].data.externalAiConsentAt instanceof Date);
  } finally {
    harness.restore();
  }
});

test("consent revocation remains available when the plan or provider is unavailable", async () => {
  const harness = loadController({ shop: shop({ plan: "BASIC", subscriptionEndsAt: new Date(0), externalAiEnabled: true }), configured: false, feature: false });
  try {
    const res = response();
    await harness.controller.updateExternalAiConsent({ user: { role: "MERCHANT", userId: "owner-1" }, body: { enabled: false } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.externalAi.enabled, false);
    assert.equal(res.payload.externalAi.available, false);
    assert.deepEqual(harness.updates[0].data, { externalAiEnabled: false, externalAiConsentAt: null, externalAiConsentVersion: null });
  } finally {
    harness.restore();
  }
});

test("owner cannot grant external consent without entitlement or provider configuration", async () => {
  const noFeature = loadController({ shop: shop(), feature: false });
  try {
    const res = response();
    await noFeature.controller.updateExternalAiConsent({ user: { role: "MERCHANT", userId: "owner-1" }, body: { enabled: true } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(noFeature.updates.length, 0);
  } finally {
    noFeature.restore();
  }

  const noProvider = loadController({ shop: shop(), configured: false });
  try {
    const res = response();
    await noProvider.controller.updateExternalAiConsent({ user: { role: "MERCHANT", userId: "owner-1" }, body: { enabled: true } }, res);
    assert.equal(res.statusCode, 503);
    assert.equal(noProvider.updates.length, 0);
  } finally {
    noProvider.restore();
  }
});
