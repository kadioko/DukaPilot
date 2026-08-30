const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const authPath = path.resolve(__dirname, "../src/controllers/auth.controller.js");
const publicRoutesPath = path.resolve(__dirname, "../src/routes/public.routes.js");

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

test("merchant registration saves sanitized campaign attribution on the new shop", async () => {
  process.env.JWT_SECRET = "marketing-test-secret";
  let createdShop;
  mockPrisma({
    user: {
      findUnique: async ({ where }) => where.phone ? null : {
        id: "merchant-1",
        phone: "+255700000009",
        name: "Amina",
        role: "MERCHANT",
        language: "sw",
        shop: { id: "shop-1", name: "Duka la Amina", plan: "FREE_TRIAL", isActive: true },
      },
      create: async () => ({ id: "merchant-1", phone: "+255700000009", name: "Amina", role: "MERCHANT" }),
    },
    staffMember: { findUnique: async () => null },
    shop: { create: async ({ data }) => { createdShop = data; return { id: "shop-1", ...data }; } },
  });
  delete require.cache[authPath];
  const { register } = require(authPath);
  const req = {
    body: {
      phone: "+255700000009",
      pin: "1234",
      name: "Amina",
      role: "MERCHANT",
      shopName: "Duka la Amina",
      acquisition: { source: "  whatsapp  ", medium: "paid_social", campaign: "launch-july", content: "status-01" },
    },
  };
  const res = response();

  await register(req, res, (error) => { throw error; });

  assert.equal(res.statusCode, 201);
  assert.equal(createdShop.acquisitionSource, "whatsapp");
  assert.equal(createdShop.acquisitionMedium, "paid_social");
  assert.equal(createdShop.acquisitionCampaign, "launch-july");
  assert.equal(createdShop.acquisitionContent, "status-01");
});

test("public marketing events accept only the four anonymous funnel events", async () => {
  const createdEvents = [];
  mockPrisma({
    marketingEvent: { findFirst: async () => null, create: async ({ data }) => { createdEvents.push(data); return { id: `event-${createdEvents.length}`, ...data }; } },
  });
  delete require.cache[publicRoutesPath];
  const router = require(publicRoutesPath);
  const eventsLayer = router.stack.find((layer) => layer.route?.path === "/events" && layer.route.methods.post);
  const handler = eventsLayer.route.stack.at(-1).handle;
  for (const eventName of ["store_click", "signup_started", "trial_started", "whatsapp_started"]) {
    const res = response();
    await handler({
      body: {
        eventName,
        sessionId: "a0b1c2d3-e4f5-6789-abcd-ef0123456789",
        product: "dukapilot_web",
        source: "instagram",
        campaign: "launch-august",
        phone: "+255700000001",
        email: "amina@example.com",
        details: { path: "/sales", customerName: "Amina" },
      },
    }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 201);
  }

  assert.deepEqual(createdEvents.map((event) => event.eventName), ["store_click", "signup_started", "trial_started", "whatsapp_started"]);
  for (const event of createdEvents) {
    assert.equal(event.sessionId, "a0b1c2d3-e4f5-6789-abcd-ef0123456789");
    assert.equal(event.source, "instagram");
    assert.equal(event.campaign, "launch-august");
    assert.deepEqual(event.details, { product: "dukapilot_web" });
    assert.equal(event.phone, undefined);
    assert.equal(event.email, undefined);
    assert.equal(event.pagePath, undefined);
  }
});

test("public marketing events reject legacy names and invalid product payloads", async () => {
  mockPrisma({ marketingEvent: { findFirst: async () => null, create: async () => { throw new Error("must not write"); } } });
  delete require.cache[publicRoutesPath];
  const router = require(publicRoutesPath);
  const eventsLayer = router.stack.find((layer) => layer.route?.path === "/events" && layer.route.methods.post);
  const handler = eventsLayer.route.stack.at(-1).handle;

  for (const body of [
    { eventName: "whatsapp_click", sessionId: "a0b1c2d3-e4f5-6789-abcd-ef0123456789", product: "dukapilot_web" },
    { eventName: "store_click", sessionId: "a0b1c2d3-e4f5-6789-abcd-ef0123456789", product: "other_product" },
  ]) {
    const res = response();
    await handler({ body }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 400);
  }
});

test("public shop catalog searches and returns a bounded product page", async () => {
  let productFindArgs;
  mockPrisma({
    shop: {
      findUnique: async () => ({
        id: "shop-1",
        name: "Duka la Amina",
        location: "Mwanza",
        district: "Ilemela",
        category: "RETAIL",
        plan: "PRO",
        subscriptionEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        isActive: true,
        isCatalogPublished: true,
        isDemo: false,
        user: { phone: "+255700000001" },
        _count: { products: 101 },
      }),
    },
    product: {
      findMany: async (args) => {
        productFindArgs = args;
        return [{ id: "product-1", name: "Rice", sellingPrice: 3000, currentStock: 12 }];
      },
      count: async () => 101,
    },
  });
  delete require.cache[publicRoutesPath];
  const router = require(publicRoutesPath);
  const catalogLayer = router.stack.find((layer) => layer.route?.path === "/shops/:id" && layer.route.methods.get);
  const handler = catalogLayer.route.stack.at(-1).handle;
  const res = response();

  await handler({ params: { id: "shop-1" }, query: { search: "rice", limit: "500", offset: "2" } }, res, (error) => { throw error; });

  assert.equal(res.statusCode, 200);
  assert.equal(productFindArgs.take, 100);
  assert.equal(productFindArgs.skip, 2);
  assert.equal(productFindArgs.where.shopId, "shop-1");
  assert.deepEqual(productFindArgs.where.OR, [
    { name: { contains: "rice", mode: "insensitive" } },
    { sku: { contains: "rice", mode: "insensitive" } },
    { barcode: "RICE" },
  ]);
  assert.deepEqual(res.payload.pagination, { total: 101, limit: 100, offset: 2, hasMore: true });
});
