const test = require("node:test");
const assert = require("node:assert/strict");

const { distributeLandedCost } = require("../src/controllers/stockReceipt.controller");
const { summarizeSession } = require("../src/controllers/cashSession.controller");

test("landed costs are distributed across received stock without losing a TZS", () => {
  const lines = distributeLandedCost([
    { productId: "rice", quantity: 10, unitCost: 1000 },
    { productId: "beans", quantity: 5, unitCost: 2000 },
  ], 1500, 500);

  assert.equal(lines[0].productCost, 10000);
  assert.equal(lines[1].productCost, 10000);
  assert.equal(lines[0].allocatedAdditionalCost + lines[1].allocatedAdditionalCost, 2000);
  assert.equal(lines[0].landedTotalCost + lines[1].landedTotalCost, 22000);
  assert.equal(lines[0].landedUnitCost, 1100);
  assert.equal(lines[1].landedUnitCost, 2200);
});

test("cash session summary reconciles opening cash, sales, collections, and expenses", async () => {
  const tx = {
    sale: { aggregate: async () => ({ _sum: { totalAmount: 150000 }, _count: { id: 7 } }) },
    debtPayment: { aggregate: async () => ({ _sum: { amount: 20000 }, _count: { id: 2 } }) },
    expense: { aggregate: async () => ({ _sum: { amount: 18000 }, _count: { id: 1 } }) },
  };
  const summary = await summarizeSession(tx, { id: "session-1", openingCash: 10000 });

  assert.deepEqual(summary, {
    cashSales: 150000,
    debtCollections: 20000,
    cashExpenses: 18000,
    saleCount: 7,
    debtPaymentCount: 2,
    expenseCount: 1,
    expectedCash: 162000,
  });
});
