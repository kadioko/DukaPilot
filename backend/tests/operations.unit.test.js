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
    quotationPayment: { aggregate: async ({ where }) => where.kind === "REFUND" ? ({ _sum: { amount: 0 }, _count: { id: 0 } }) : ({ _sum: { amount: 30000 }, _count: { id: 2 } }) },
    expense: { aggregate: async () => ({ _sum: { amount: 18000 }, _count: { id: 1 } }) },
  };
  const summary = await summarizeSession(tx, { id: "session-1", openingCash: 10000 });

  assert.deepEqual(summary, {
    cashSales: 150000,
    debtCollections: 20000,
    quotationCash: 30000,
    cashExpenses: 18000,
    inventoryCashOut: 0,
    cookingCashOut: 0,
    saleCount: 7,
    debtPaymentCount: 2,
    quotationPaymentCount: 2,
    expenseCount: 1,
    stockReceiptCount: 0,
    cookingCostCount: 0,
    expectedCash: 192000,
  });
});

test("cash session treats a quotation refund as cash leaving the drawer", async () => {
  const tx = {
    sale: { aggregate: async () => ({ _sum: { totalAmount: 0 }, _count: { id: 0 } }) },
    debtPayment: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
    quotationPayment: { aggregate: async ({ where }) => where.kind === "REFUND" ? ({ _sum: { amount: 10000 }, _count: { id: 1 } }) : ({ _sum: { amount: 50000 }, _count: { id: 1 } }) },
    expense: { aggregate: async () => ({ _sum: { amount: 0 }, _count: { id: 0 } }) },
  };
  const summary = await summarizeSession(tx, { id: "session-1", openingCash: 5000 });
  assert.equal(summary.quotationCash, 40000);
  assert.equal(summary.quotationPaymentCount, 2);
  assert.equal(summary.expectedCash, 45000);
});
