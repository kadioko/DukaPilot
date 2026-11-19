const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

test("only the owner can change a branch's product name display", async () => {
  const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
  const accessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
  const controllerPath = path.resolve(__dirname, "../src/controllers/settings.controller.js");
  const originals = new Map([prismaPath, accessPath, controllerPath].map((p) => [p, require.cache[p]]));
  const updates = [];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { shop: { update: async (args) => { updates.push(args); return { id: args.where.id, ...args.data }; } } } };
  require.cache[accessPath] = { id: accessPath, filename: accessPath, loaded: true, exports: { getShopIdForUser: async (user) => user.resolvedShopId } };
  delete require.cache[controllerPath];
  const { updateProductNameCase } = require(controllerPath);
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } });
  try {
    for (const productNameCase of ["ORIGINAL", "UPPERCASE", "LOWERCASE"]) {
      const req = { user: { role: "MERCHANT", resolvedShopId: "branch-1" }, body: { productNameCase } };
      const res = response();
      await updateProductNameCase(req, res, (error) => { throw error; });
      assert.equal(res.body.productNameCase, productNameCase);
      assert.equal(updates.at(-1).where.id, "branch-1");
      assert.deepEqual(updates.at(-1).data, { productNameCase });
      assert.equal(req.audit.action, "settings.product_name_case.update");
    }
    const invalid = response();
    await updateProductNameCase({ user: { role: "MERCHANT", resolvedShopId: "branch-1" }, body: { productNameCase: "INVALID" } }, invalid, (error) => { throw error; });
    assert.equal(invalid.statusCode, 400);
    const staff = response();
    await updateProductNameCase({ user: { role: "MERCHANT", staffId: "staff-1", resolvedShopId: "branch-1" }, body: { productNameCase: "UPPERCASE" } }, staff, (error) => { throw error; });
    assert.equal(staff.statusCode, 403);
    assert.equal(updates.length, 3);
  } finally {
    for (const [p, original] of originals) { if (original) require.cache[p] = original; else delete require.cache[p]; }
  }
});
