const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const cashSessionPath = path.resolve(__dirname, "../src/lib/cashSession.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/farm.controller.js");
const { weightedAverageCost } = require("../src/lib/weightedAverageCost");
const { staffPermissions } = require("../src/controllers/auth.controller");
const { recordLiveAnimalSale, reverseLiveAnimalSales } = require("../src/lib/farmLivestockSales");

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

test("farm output cost uses moving weighted average across on-hand and new batches", () => {
  assert.equal(weightedAverageCost({ currentQuantity: 5, currentUnitCost: 3000, addedQuantity: 2, addedTotalCost: 12000 }), 3857);
  assert.equal(weightedAverageCost({ currentQuantity: 0, currentUnitCost: 9999, addedQuantity: 4, addedTotalCost: 18000 }), 4500);
  assert.equal(weightedAverageCost({ currentQuantity: 0, currentUnitCost: 0, addedQuantity: 0, addedTotalCost: 0 }), 0);
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

test("retried livestock events reuse their key without changing animal or linked-product stock twice", async () => {
  const events = [];
  const groupUpdates = [];
  const productUpdates = [];
  const transaction = {
    farmAnimalEvent: {
      findUnique: async ({ where }) => events.find((event) => event.groupId === where.groupId_clientRequestId.groupId && event.clientRequestId === where.groupId_clientRequestId.clientRequestId) || null,
      create: async ({ data }) => { const event = { id: `event-${events.length + 1}`, ...data }; events.push(event); return event; },
    },
    farmGroup: {
      findFirst: async () => ({ id: "group-1", currentAnimals: 10, liveProductId: "live-goat", liveProduct: { currentStock: 10 } }),
      updateMany: async (args) => { groupUpdates.push(args); return { count: 1 }; },
      findUnique: async () => ({ id: "group-1", currentAnimals: 8 }),
    },
    product: { updateMany: async (args) => { productUpdates.push(args); return { count: 1 }; } },
    stockMovement: { create: async () => ({}) },
  };
  const controller = loadController({ $transaction: async (work) => work(transaction) });
  const request = { user: { userId: "owner-1", role: "MERCHANT" }, params: { id: "group-1" }, body: { type: "MORTALITY", quantity: 2, occurredAt: "2026-10-02", clientRequestId: "farm_event_retry_001" } };

  const first = response();
  await controller.recordAnimalEvent(request, first);
  const retry = response();
  await controller.recordAnimalEvent(request, retry);

  assert.equal(first.statusCode, 201);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.payload.reused, true);
  assert.equal(events.length, 1);
  assert.equal(groupUpdates.length, 1);
  assert.equal(productUpdates.length, 1);
  assert.equal(productUpdates[0].data.currentStock.decrement, 2);
});

test("live-animal POS sale decrements the mapped group and records the sale item", async () => {
  const groupUpdates = [];
  const events = [];
  const tx = {
    farmGroup: {
      findFirst: async () => ({ id: "group-1", name: "Goat pen", isActive: true }),
      updateMany: async (args) => { groupUpdates.push(args); return { count: 1 }; },
    },
    farmAnimalEvent: { create: async ({ data }) => { events.push(data); return data; } },
  };
  await recordLiveAnimalSale(tx, {
    shopId: "shop-1", saleItems: [{ id: "sale-item-1", productId: "live-goat" }],
    quantityByProduct: { "live-goat": 2 }, receiptNumber: 14, recordedBy: "cashier-1",
    occurredAt: new Date("2026-10-02T08:00:00Z"),
  });
  assert.deepEqual(groupUpdates[0].where, { id: "group-1", shopId: "shop-1", isActive: true, currentAnimals: { gte: 2 } });
  assert.equal(groupUpdates[0].data.currentAnimals.decrement, 2);
  assert.equal(events[0].type, "SALE");
  assert.equal(events[0].saleItemId, "sale-item-1");
  assert.equal(events[0].quantity, 2);
});

test("duplicate live-animal sale lines aggregate herd stock and fractional animals are rejected", async () => {
  const groupUpdates = [];
  const events = [];
  const tx = {
    farmGroup: {
      findFirst: async () => ({ id: "group-1", name: "Goat pen", isActive: true }),
      updateMany: async (args) => { groupUpdates.push(args); return { count: 1 }; },
    },
    farmAnimalEvent: { create: async ({ data }) => { events.push(data); return data; } },
  };
  await recordLiveAnimalSale(tx, {
    shopId: "shop-1", saleItems: [
      { id: "sale-item-1", productId: "live-goat", quantity: 1 },
      { id: "sale-item-2", productId: "live-goat", quantity: 2 },
    ],
    quantityByProduct: {}, receiptNumber: 15, recordedBy: "cashier-1", occurredAt: new Date(),
  });
  assert.equal(groupUpdates.length, 1);
  assert.equal(groupUpdates[0].data.currentAnimals.decrement, 3);
  assert.deepEqual(events.map((event) => event.quantity), [1, 2]);

  await assert.rejects(recordLiveAnimalSale(tx, {
    shopId: "shop-1", saleItems: [{ id: "sale-item-3", productId: "live-goat", quantity: 0.5 }],
    quantityByProduct: {}, receiptNumber: 16, recordedBy: "cashier-1", occurredAt: new Date(),
  }), /whole numbers/);
  assert.equal(groupUpdates.length, 1);
});

test("voiding a sale restores animal counts while retaining a voided audit event", async () => {
  const eventUpdates = [];
  const groupUpdates = [];
  const tx = {
    farmAnimalEvent: {
      findMany: async () => [{ id: "event-1", groupId: "group-1", quantity: 2 }],
      updateMany: async (args) => { eventUpdates.push(args); return { count: 1 }; },
    },
    farmGroup: { updateMany: async (args) => { groupUpdates.push(args); return { count: 1 }; } },
  };
  const voidedAt = new Date("2026-10-02T09:00:00Z");
  await reverseLiveAnimalSales(tx, { shopId: "shop-1", saleItemIds: ["sale-item-1"], voidedAt });
  assert.equal(groupUpdates[0].where.id, "group-1");
  assert.equal(groupUpdates[0].data.currentAnimals.increment, 2);
  assert.deepEqual(eventUpdates[0].data, { voidedAt });
  assert.equal(eventUpdates[0].where.voidedAt, null);
});

test("farm staff permission is included in authenticated staff permissions", () => {
  assert.equal(staffPermissions({ canManageFarm: true }).canManageFarm, true);
  assert.equal(staffPermissions({ canManageFarm: false }).canManageFarm, false);
});
