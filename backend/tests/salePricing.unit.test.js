const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/settings.controller.js");

function loadController(prismaMock) {
  delete require.cache[controllerPath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
  require.cache[shopAccessPath] = {
    id: shopAccessPath,
    filename: shopAccessPath,
    loaded: true,
    exports: { getShopIdForUser: async () => "branch-1", getBillingShopIdForUser: async () => "business-1" },
  };
  return require(controllerPath);
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

test("only the owner can change business-wide variable sale pricing", async () => {
  const updates = [];
  const controller = loadController({
    shop: { update: async (args) => { updates.push(args); return { id: args.where.id, ...args.data }; } },
  });
  const staff = response();
  await controller.updateSalePricing({ user: { role: "MERCHANT", staffId: "staff-1" }, body: { allowVariableSalePrices: true } }, staff);
  assert.equal(staff.statusCode, 403);

  const invalid = response();
  await controller.updateSalePricing({ user: { role: "MERCHANT", userId: "owner-1" }, body: { allowVariableSalePrices: "true" } }, invalid);
  assert.equal(invalid.statusCode, 400);

  const owner = response();
  const req = { user: { role: "MERCHANT", userId: "owner-1", resolvedShopId: "branch-1" }, body: { allowVariableSalePrices: true } };
  await controller.updateSalePricing(req, owner);
  assert.equal(owner.payload.allowVariableSalePrices, true);
  assert.deepEqual(updates, [{ where: { id: "business-1" }, data: { allowVariableSalePrices: true }, select: { id: true, allowVariableSalePrices: true } }]);
  assert.equal(req.audit.action, "settings.sale_pricing.update");
});

test("staff settings read the parent business price policy", async () => {
  const controller = loadController({
    staffMember: { findFirst: async () => ({ id: "staff-1", name: "Asha", shop: { id: "branch-1", name: "Branch" } }) },
    shop: { findUnique: async ({ where }) => { assert.equal(where.id, "business-1"); return { allowVariableSalePrices: true }; } },
  });
  const res = response();
  await controller.getSettings({ user: { staffId: "staff-1", role: "MERCHANT", businessShopId: "business-1" } }, res);
  assert.equal(res.payload.settings.shop.allowVariableSalePrices, true);
  assert.equal(res.payload.settings.isStaff, true);
});
