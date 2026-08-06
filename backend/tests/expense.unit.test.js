const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/expense.controller.js");

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function loadController(prismaMock) {
  delete require.cache[controllerPath];
  delete require.cache[path.resolve(__dirname, "../src/lib/shopAccess.js")];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
  return require(controllerPath);
}

test("expense creation accepts the public name field and a backdated spentAt date", async () => {
  let captured;
  const controller = loadController({
    shop: { findUnique: async () => ({ id: "shop-1" }) },
    expense: {
      create: async ({ data }) => {
        captured = data;
        return { id: "expense-1", ...data };
      },
    },
  });
  const req = {
    user: { userId: "owner-1" },
    headers: { "x-dukapilot-language": "sw" },
    body: { name: "LUKU ya wiki iliyopita", amount: 25000, spentAt: "2026-07-29", category: "UTILITIES" },
  };
  const res = response();

  await controller.create(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(captured.title, "LUKU ya wiki iliyopita");
  assert.equal(captured.spentAt.toISOString(), "2026-07-29T12:00:00.000Z");
});

test("expense validation uses Swahili and rejects an invalid date", async () => {
  const controller = loadController({ shop: { findUnique: async () => ({ id: "shop-1" }) } });
  const req = {
    user: { userId: "owner-1" },
    headers: { "x-dukapilot-language": "sw" },
    body: { name: "LUKU", amount: 25000, spentAt: "tarehe-mbaya" },
  };
  const res = response();

  await controller.create(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.code, "INVALID_EXPENSE_DATE");
  assert.match(res.payload.error, /Tarehe/);
});
