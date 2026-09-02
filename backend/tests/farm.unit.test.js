const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const cashSessionPath = path.resolve(__dirname, "../src/lib/cashSession.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/farm.controller.js");
const { staffPermissions } = require("../src/controllers/auth.controller");

function response() {
  return { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
}

function loadController(prismaMock) {
  delete require.cache[controllerPath];
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
  require.cache[shopAccessPath] = { id: shopAccessPath, filename: shopAccessPath, loaded: true, exports: { getShopIdForUser: async () => "shop-1" } };
  require.cache[cashSessionPath] = { id: cashSessionPath, filename: cashSessionPath, loaded: true, exports: { findOpenCashSession: async () => null } };
  return require(controllerPath);
}

test("farm production spreads used feed and direct cost across actual output", () => {
  const { costsFor } = loadController({});
  assert.deepEqual(costsFor([
    { productId: "feed", quantity: 5, unitCost: 1400 },
    { productId: "trays", quantity: 10, unitCost: 100 },
  ], 2000, 280, 288), {
    ingredientCost: 8000,
    totalCost: 10000,
    unitCost: 36,
    wasteQuantity: 8,
  });
});

test("farm batches hide all costs from staff without reports permission", () => {
  const { redactBatch, redactConversion } = loadController({});
  const req = { user: { role: "MERCHANT", staffId: "staff-1", permissions: { canViewReports: false } } };
  const batch = redactBatch({ ingredientCost: 8000, additionalCost: 2000, totalCost: 10000, unitCost: 36, items: [{ unitCost: 1400, totalCost: 7000 }] }, req);
  const conversion = redactConversion({ totalCost: 1080, unitCost: 1080 }, req);
  assert.equal(batch.ingredientCost, null);
  assert.equal(batch.additionalCost, null);
  assert.equal(batch.totalCost, null);
  assert.equal(batch.unitCost, null);
  assert.equal(batch.items[0].totalCost, null);
  assert.equal(conversion.totalCost, null);
  assert.equal(conversion.unitCost, null);
});

test("farm production deducts used supplies and adds only the produced output", async () => {
  const productUpdates = [];
  const stockMovements = [];
  const tx = {
    farmGroup: { findFirst: async () => ({ id: "group-1", profileType: "LAYERS" }) },
    product: {
      findMany: async () => [
        { id: "eggs", name: "Egg", currentStock: 0, buyingPrice: 0 },
        { id: "feed", name: "Layer feed", currentStock: 20, buyingPrice: 1400 },
      ],
      updateMany: async (args) => { productUpdates.push(args); return { count: 1 }; },
      update: async (args) => { productUpdates.push(args); return { id: args.where.id }; },
    },
    farmProductionBatch: {
      create: async () => ({ id: "farm-batch-1" }),
      findUnique: async () => ({
        id: "farm-batch-1", ingredientCost: 7000, additionalCost: 0, totalCost: 7000, unitCost: 25, wasteQuantity: 8,
        group: { id: "group-1", name: "Layer house A", profileType: "LAYERS" }, outputProduct: { id: "eggs", name: "Egg", unit: "egg" },
        items: [{ id: "item-1", quantity: 5, unitCost: 1400, totalCost: 7000, product: { id: "feed", name: "Layer feed", unit: "kg" } }],
      }),
    },
    stockMovement: { create: async (args) => { stockMovements.push(args.data); return args.data; } },
  };
  const controller = loadController({ $transaction: async (fn) => fn(tx) });
  const res = response();

  await controller.createProduction({
    user: { userId: "owner-1", role: "MERCHANT" },
    body: { groupId: "group-1", outputProductId: "eggs", type: "EGGS", expectedYield: 288, actualYield: 280, additionalCost: 0, paymentMethod: "CASH", producedAt: "2026-09-02", items: [{ productId: "feed", quantity: 5 }] },
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(productUpdates[0].where.id, "feed");
  assert.equal(productUpdates[0].data.currentStock.decrement, 5);
  assert.equal(productUpdates[1].where.id, "eggs");
  assert.equal(productUpdates[1].data.currentStock.increment, 280);
  assert.deepEqual(stockMovements.map((movement) => [movement.type, movement.productId, movement.quantity]), [["OUT", "feed", 5], ["IN", "eggs", 280]]);
  assert.equal(res.payload.batch.unitCost, 25);
});

test("farm staff permission is included in authenticated staff permissions", () => {
  assert.equal(staffPermissions({ canManageFarm: true }).canManageFarm, true);
  assert.equal(staffPermissions({ canManageFarm: false }).canManageFarm, false);
});
