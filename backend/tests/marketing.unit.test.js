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

test("public marketing events persist only the approved anonymous fields", async () => {
  let createdEvent;
  mockPrisma({
    marketingEvent: { create: async ({ data }) => { createdEvent = data; return { id: "event-1", ...data }; } },
  });
  delete require.cache[publicRoutesPath];
  const router = require(publicRoutesPath);
  const eventsLayer = router.stack.find((layer) => layer.route?.path === "/events" && layer.route.methods.post);
  const handler = eventsLayer.route.stack[0].handle;
  const req = {
    body: {
      eventName: "whatsapp_click",
      sessionId: "session-12345",
      source: "instagram",
      campaign: "launch-july",
      details: { intent: "setup", unexpected: "do-not-store" },
    },
  };
  const res = response();

  await handler(req, res, (error) => { throw error; });

  assert.equal(res.statusCode, 201);
  assert.equal(createdEvent.source, "instagram");
  assert.deepEqual(createdEvent.details, { placement: null, intent: "setup" });
  assert.equal(createdEvent.details.unexpected, undefined);
});
