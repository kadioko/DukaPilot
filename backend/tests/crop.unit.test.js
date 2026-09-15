const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const cashSessionPath = path.resolve(__dirname, "../src/lib/cashSession.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/crop.controller.js");
const { allocateCropHarvestForSale, reverseCropHarvestSaleAllocations } = require("../src/lib/cropHarvestSales");

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

test("crop reports hide financial values from field staff without report access", () => {
  const { reportCycle } = loadController({});
  const report = reportCycle({
    id: "cycle-1", cropName: "Maize", status: "GROWING", plot: { areaMilli: 1000 }, inputUsages: [{ totalCost: 8000 }],
    harvestBatches: [{ outputProductId: "maize", actualYield: 20, remainingQuantity: 12, soldQuantity: 8, wasteQuantity: 1, remainingCost: 4800, realizedRevenue: 24000, realizedCost: 3200, outputProduct: { name: "Maize", unit: "kg", sellingPrice: 4000 } }],
  }, false);
  assert.equal("inputCost" in report, false);
  assert.equal("realizedProfit" in report, false);
  assert.deepEqual(report.outputs[0], { productId: "maize", name: "Maize", unit: "kg", harvestedQuantity: 20, remainingQuantity: 12, soldQuantity: 8, wasteQuantity: 1 });
});

test("recording a stocked crop input uses guarded stock deduction and keeps its cost with the crop cycle", async () => {
  const productUpdates = [];
  const stockMovements = [];
  const tx = {
    cropCycle: { findFirst: async () => ({ id: "cycle-1" }) },
    product: {
      findFirst: async () => ({ id: "fertilizer", name: "NPK", buyingPrice: 25000, currentStock: 10 }),
      updateMany: async (args) => { productUpdates.push(args); return { count: 1 }; },
    },
    cropInputUsage: { findUnique: async () => null, create: async (args) => ({ id: "input-1", ...args.data }) },
    stockMovement: { create: async (args) => { stockMovements.push(args.data); return args.data; } },
  };
  const controller = loadController({ $transaction: async (fn) => fn(tx) });
  const res = response();
  await controller.recordInput({ user: { userId: "owner-1", role: "MERCHANT" }, body: { cropCycleId: "cycle-1", productId: "fertilizer", category: "FERTILIZER", quantity: 2, paymentMethod: "CASH", usedAt: "2026-09-14" } }, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(productUpdates[0].where.currentStock, { gte: 2 });
  assert.equal(productUpdates[0].data.currentStock.decrement, 2);
  assert.equal(res.payload.input.totalCost, 50000);
  assert.deepEqual(stockMovements, [{ type: "OUT", quantity: 2, note: "Crop input #nput-1", productId: "fertilizer" }]);
});

test("recording a first harvest creates sellable stock and allocates its input cost through the durable ledger", async () => {
  const productUpdates = [];
  const stockMovements = [];
  const costAllocations = [];
  const batchUpdates = [];
  const tx = {
    cropCycle: { findFirst: async () => ({ id: "cycle-1", expectedYield: 20 }), update: async () => ({}) },
    product: { findFirst: async () => ({ id: "maize", name: "Maize", currentStock: 0 }), update: async (args) => { productUpdates.push(args); return args.data; } },
    cropInputUsage: { findMany: async () => [{ id: "input-1", totalCost: 90000, costAllocations: [] }] },
    cropInputCostAllocation: { create: async (args) => { costAllocations.push(args.data); return args.data; } },
    cropHarvestBatch: {
      findMany: async () => [],
      count: async () => 0,
      create: async (args) => ({ id: "harvest-1", ...args.data }),
      update: async (args) => { batchUpdates.push(args.data); return args.data; },
      findUnique: async () => ({ id: "harvest-1", totalCost: 90000, unitCost: 4500, remainingCost: 90000, realizedRevenue: 0, realizedCost: 0, outputProduct: { id: "maize", name: "Maize", unit: "kg" }, cropCycle: { id: "cycle-1", cropName: "Maize" } }),
    },
    stockMovement: { create: async (args) => { stockMovements.push(args.data); return args.data; } },
  };
  const controller = loadController({ $transaction: async (fn) => fn(tx) });
  const res = response();
  await controller.recordHarvest({ user: { userId: "owner-1", role: "MERCHANT" }, body: { cropCycleId: "cycle-1", outputProductId: "maize", actualYield: 20, wasteQuantity: 1, harvestAt: "2026-09-14" } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(productUpdates[0].data.currentStock.increment, 20);
  assert.equal(productUpdates[0].data.buyingPrice, 4500);
  assert.deepEqual(costAllocations, [{ cropInputUsageId: "input-1", harvestBatchId: "harvest-1", amount: 90000, reason: "HARVEST" }]);
  assert.equal(batchUpdates[0].totalCost, 90000);
  assert.deepEqual(stockMovements, [{ type: "IN", quantity: 20, note: "Crop harvest #vest-1; waste 1", productId: "maize", cropHarvestBatchId: "harvest-1" }]);
  assert.equal(res.payload.batch.totalCost, 90000);
});

test("a crop cycle accepts a second harvest when its expected total yield was set before the first pick", async () => {
  const costAllocations = [];
  const tx = {
    cropCycle: { findFirst: async () => ({ id: "cycle-1", expectedYield: 100 }), update: async () => ({}) },
    product: { findFirst: async () => ({ id: "maize", name: "Maize", currentStock: 0 }), update: async () => ({}) },
    cropInputUsage: { findMany: async () => [{ id: "input-1", totalCost: 90000, costAllocations: [{ amount: 36000 }] }] },
    cropInputCostAllocation: { create: async (args) => { costAllocations.push(args.data); return args.data; } },
    cropHarvestBatch: {
      findMany: async () => [{ actualYield: 40, expectedYield: 100 }],
      count: async () => 1,
      create: async (args) => ({ id: "harvest-2", ...args.data }),
      update: async () => ({}),
      findUnique: async () => ({ id: "harvest-2", totalCost: 18000, unitCost: 900, remainingCost: 18000, realizedRevenue: 0, realizedCost: 0, outputProduct: { id: "maize", name: "Maize", unit: "kg" }, cropCycle: { id: "cycle-1", cropName: "Maize" } }),
    },
    stockMovement: { create: async () => ({}) },
  };
  const controller = loadController({ $transaction: async (fn) => fn(tx) });
  const res = response();
  await controller.recordHarvest({ user: { userId: "owner-1", role: "MERCHANT" }, body: { cropCycleId: "cycle-1", outputProductId: "maize", actualYield: 20, expectedYield: 100, wasteQuantity: 0, harvestAt: "2026-09-14" } }, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(costAllocations, [{ cropInputUsageId: "input-1", harvestBatchId: "harvest-2", amount: 18000, reason: "HARVEST" }]);
  assert.equal(res.payload.batch.totalCost, 18000);
});

test("a retried offline field task reuses its durable receipt instead of creating a second task", async () => {
  const tasks = [];
  const receipts = [];
  const tx = {
    cropOperationReceipt: {
      findUnique: async ({ where }) => receipts.find((receipt) => receipt.shopId === where.shopId_clientRequestId.shopId && receipt.clientRequestId === where.shopId_clientRequestId.clientRequestId) || null,
      create: async ({ data }) => { const receipt = { id: `receipt-${receipts.length + 1}`, ...data }; receipts.push(receipt); return receipt; },
    },
    cropCycle: { findFirst: async () => ({ id: "cycle-1" }) },
    cropFieldTask: {
      create: async ({ data }) => { const task = { id: `task-${tasks.length + 1}`, ...data, updatedAt: new Date() }; tasks.push(task); return task; },
      findFirst: async ({ where }) => tasks.find((task) => task.id === where.id && task.shopId === where.shopId) || null,
    },
    staffMember: { findFirst: async () => null },
  };
  const controller = loadController({ $transaction: async (fn) => fn(tx) });
  const request = {
    user: { userId: "owner-1", role: "MERCHANT" },
    body: { cropCycleId: "cycle-1", title: "Water Field A", priority: "HIGH", clientRequestId: "crop_task_retry_0001" },
  };

  const first = response();
  await controller.createTask(request, first);
  const retry = response();
  await controller.createTask(request, retry);

  assert.equal(first.statusCode, 201);
  assert.equal(retry.statusCode, 200);
  assert.equal(first.payload.reused, false);
  assert.equal(retry.payload.reused, true);
  assert.equal(tasks.length, 1);
  assert.equal(receipts.length, 1);
});

test("crop harvest sale allocations are FIFO and reverse when a sale is voided", async () => {
  const updates = [];
  const allocations = [];
  const tx = {
    cropHarvestBatch: {
      findMany: async () => [{ id: "batch-1", remainingQuantity: 10, remainingCost: 20000, unitCost: 2000 }],
      updateMany: async (args) => { updates.push(args); return { count: 1 }; },
      update: async (args) => { updates.push(args); return args.data; },
    },
    cropHarvestAllocation: {
      create: async (args) => { allocations.push(args.data); return args.data; },
      findMany: async () => allocations.map((allocation) => ({ id: "allocation-1", harvestBatchId: allocation.harvestBatchId, saleItemId: allocation.saleItemId, quantity: allocation.quantity, revenue: allocation.revenue, cost: allocation.cost })),
      deleteMany: async () => ({ count: allocations.length }),
    },
  };
  await allocateCropHarvestForSale(tx, "shop-1", [{ id: "sale-item-1", productId: "maize", quantity: 4, unitPrice: 3500 }]);
  assert.equal(updates[0].data.remainingQuantity.decrement, 4);
  assert.equal(updates[0].data.remainingCost.decrement, 8000);
  assert.deepEqual(allocations, [{ harvestBatchId: "batch-1", saleItemId: "sale-item-1", quantity: 4, revenue: 14000, cost: 8000 }]);

  await reverseCropHarvestSaleAllocations(tx, ["sale-item-1"]);
  assert.equal(updates[1].data.remainingQuantity.increment, 4);
  assert.equal(updates[1].data.realizedRevenue.decrement, 14000);
});
