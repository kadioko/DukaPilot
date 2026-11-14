const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/supplier.controller.js");

test("merchant supplier list puts own suppliers first and shared demo suppliers last without crossing shops", async () => {
  const paths = [prismaPath, shopAccessPath, controllerPath];
  const originals = new Map(paths.map((file) => [file, require.cache[file]]));
  const records = [
    { id: "demo-beauty", name: "Beauty", phone: "+255700000007", createdByShopId: null },
    { id: "shared", name: "Real supplier", phone: "+255755123456", createdByShopId: null },
    { id: "demo-general", name: "Sample general", phone: "+255 700 000 001", createdByShopId: null },
    { id: "demo-drinks", name: "Sample drinks", phone: "+255700000006", createdByShopId: null },
    { id: "own", name: "Zed personal", phone: "+255700000007", createdByShopId: "shop-1" },
    { id: "other", name: "Other private", phone: "+255755123456", createdByShopId: "shop-2" },
  ];
  let findArgs;
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {
    supplier: { findMany: async (args) => {
      findArgs = args;
      return records.filter((supplier) => supplier.createdByShopId === null || supplier.createdByShopId === "shop-1");
    } },
  } };
  require.cache[shopAccessPath] = { id: shopAccessPath, filename: shopAccessPath, loaded: true, exports: { getShopIdForUser: async () => "shop-1" } };
  try {
    delete require.cache[controllerPath];
    const controller = require(controllerPath);
    let payload;
    await controller.list({ user: { userId: "owner-1", role: "MERCHANT" }, query: {} }, { json: (value) => { payload = value; } });
    assert.deepEqual(findArgs.where.OR, [{ createdByShopId: null }, { createdByShopId: "shop-1" }]);
    assert.deepEqual(payload.suppliers.map((supplier) => supplier.id), ["own", "shared", "demo-beauty", "demo-general", "demo-drinks"]);
    assert.equal(payload.suppliers[0].canEdit, true);
    assert.equal(payload.suppliers[1].canEdit, false);
    assert.equal(payload.suppliers.some((supplier) => supplier.id === "other"), false);
  } finally {
    for (const file of paths) {
      if (originals.get(file)) require.cache[file] = originals.get(file);
      else delete require.cache[file];
    }
  }
});

test("admin pagination keeps the database ordering and page boundaries", async () => {
  const paths = [prismaPath, shopAccessPath, controllerPath];
  const originals = new Map(paths.map((file) => [file, require.cache[file]]));
  let findArgs;
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {
    supplier: {
      count: async () => 30,
      groupBy: async () => [],
      findMany: async (args) => { findArgs = args; return [
        { id: "demo", phone: "+255700000001", createdByShopId: null },
        { id: "real", phone: "+255755123456", createdByShopId: null },
      ]; },
    },
  } };
  require.cache[shopAccessPath] = { id: shopAccessPath, filename: shopAccessPath, loaded: true, exports: { getShopIdForUser: async () => { throw new Error("admin has no merchant scope"); } } };
  try {
    delete require.cache[controllerPath];
    const controller = require(controllerPath);
    let payload;
    await controller.list({ user: { role: "ADMIN" }, query: { page: "2", limit: "10" } }, { json: (value) => { payload = value; } });
    assert.deepEqual(findArgs.orderBy, { name: "asc" });
    assert.equal(findArgs.skip, 10);
    assert.equal(findArgs.take, 10);
    assert.equal(payload.total, 30);
    assert.deepEqual(payload.suppliers.map((supplier) => supplier.id), ["demo", "real"]);
  } finally {
    for (const file of paths) {
      if (originals.get(file)) require.cache[file] = originals.get(file);
      else delete require.cache[file];
    }
  }
});
