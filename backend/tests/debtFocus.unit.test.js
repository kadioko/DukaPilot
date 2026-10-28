const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/debt.controller.js");
const mockedPaths = [prismaPath, shopAccessPath, controllerPath];

function cachedModule(id, exports) {
  return { id, filename: id, loaded: true, exports };
}

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

function loadController(prisma) {
  const originalCache = new Map(mockedPaths.map((file) => [file, require.cache[file]]));
  require.cache[prismaPath] = cachedModule(prismaPath, prisma);
  require.cache[shopAccessPath] = cachedModule(shopAccessPath, { getShopIdForUser: async () => "shop-1" });
  delete require.cache[controllerPath];
  return {
    controller: require(controllerPath),
    restore() {
      for (const file of mockedPaths) {
        const original = originalCache.get(file);
        if (original) require.cache[file] = original;
        else delete require.cache[file];
      }
    },
  };
}

test("assistant debt focus returns only a debt in the authenticated shop", async () => {
  let query;
  const loader = loadController({
    debt: { findFirst: async (args) => { query = args; return { id: "debt-1", customerName: "Asha", customerPhone: "+255712345678" }; } },
  });
  try {
    const res = response();
    await loader.controller.focusDebt({ user: { userId: "owner-1" }, params: { id: "debt-1" } }, res, (error) => { throw error; });
    assert.deepEqual(query, {
      where: { id: "debt-1", shopId: "shop-1" },
      select: { id: true, customerName: true, customerPhone: true },
    });
    assert.deepEqual(res.payload, { debt: { id: "debt-1", customerName: "Asha", customerPhone: "+255712345678" } });
  } finally {
    loader.restore();
  }
});

test("assistant debt focus does not disclose whether another shop owns the debt", async () => {
  const loader = loadController({ debt: { findFirst: async () => null } });
  try {
    const res = response();
    await loader.controller.focusDebt({ user: { userId: "owner-1" }, params: { id: "other-shop-debt" } }, res, (error) => { throw error; });
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.payload, { error: "Debt record not found" });
  } finally {
    loader.restore();
  }
});
