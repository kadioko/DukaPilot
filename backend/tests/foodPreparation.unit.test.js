const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const shopAccessPath = path.resolve(__dirname, "../src/lib/shopAccess.js");
const controllerPath = path.resolve(__dirname, "../src/controllers/foodPreparation.controller.js");
const receiptControllerPath = path.resolve(__dirname, "../src/controllers/stockReceipt.controller.js");

function loadController() {
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {} };
  require.cache[shopAccessPath] = { id: shopAccessPath, filename: shopAccessPath, loaded: true, exports: {} };
  delete require.cache[controllerPath];
  return require(controllerPath);
}

test("food preparation spreads ingredient and direct cooking costs over actual yield", () => {
  const { calculateBatchCosts } = loadController();
  const result = calculateBatchCosts([
    { productId: "chicken", quantity: 10, unitCost: 18000 },
    { productId: "charcoal", quantity: 1, unitCost: 12000 },
  ], 8000, 18, 20);

  assert.deepEqual(result, {
    ingredientCost: 192000,
    totalCost: 200000,
    unitCost: 11111,
    wasteQuantity: 2,
  });
});

test("estimated grocery allocation preserves every TZS and marks unknown costs as derived", () => {
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: {} };
  require.cache[shopAccessPath] = { id: shopAccessPath, filename: shopAccessPath, loaded: true, exports: {} };
  delete require.cache[receiptControllerPath];
  const { allocateEstimatedGroceryCost } = require(receiptControllerPath);
  const items = allocateEstimatedGroceryCost([
    { productId: "chicken", quantity: 10 },
    { productId: "oil", quantity: 4 },
  ], 220000, 10000, 0, new Map([
    ["chicken", { buyingPrice: 18000 }],
    ["oil", { buyingPrice: 10000 }],
  ]));

  assert.equal(items.reduce((sum, item) => sum + item.productCost, 0), 220000);
  assert.equal(items.reduce((sum, item) => sum + item.allocatedAdditionalCost, 0), 10000);
  assert.equal(items.reduce((sum, item) => sum + item.landedTotalCost, 0), 230000);
});
