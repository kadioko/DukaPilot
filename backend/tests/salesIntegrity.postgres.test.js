const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const database = new URL(process.env.DATABASE_URL || "postgresql://invalid");
if (!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/dukapilot_test")) {
  throw new Error("Sales integrity tests require a local dukapilot_test database");
}

const prisma = require("../src/lib/prisma");
let decorateNextTransaction;
const controlledPrisma = new Proxy(prisma, {
  get(target, key) {
    if (key === "$transaction") return (work, options) => {
      const decorate = decorateNextTransaction;
      decorateNextTransaction = null;
      return target.$transaction((tx) => work(decorate ? decorate(tx) : tx), options);
    };
    const value = target[key];
    return typeof value === "function" ? value.bind(target) : value;
  },
});
require.cache[require.resolve("../src/lib/prisma")].exports = controlledPrisma;
const cachePath = require.resolve("../src/services/dashboard-cache.service");
require.cache[cachePath] = { id: cachePath, filename: cachePath, loaded: true, exports: { invalidateDashboardHistory: async () => {} } };
const sales = require("../src/controllers/sale.controller");
const returns = require("../src/controllers/saleReturn.controller");
const debts = require("../src/controllers/debt.controller");
const shifts = require("../src/controllers/cashSession.controller");
const expenses = require("../src/controllers/expense.controller");
const crops = require("../src/controllers/crop.controller");
const dashboard = require("../src/controllers/dashboard.controller");
const productPerformance = require("../src/controllers/productPerformance.controller");

test.after(async () => prisma.$disconnect());

async function invoke(handler, req) {
  const res = { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(value) { this.payload = value; return this; } };
  await handler(req, res, (error) => res.status(error.status || 500).json({ error: error.message }));
  return res;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture(t, paymentMethod = "CASH", totalAmount = 2000) {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({ data: { phone: `sales-audit-${suffix}`, pin: "test-only", name: "Synthetic sales owner" } });
  const shop = await prisma.shop.create({ data: { userId: user.id, name: "Synthetic sales audit", location: "Test", referralCode: suffix } });
  t.after(async () => {
    await prisma.$executeRawUnsafe(
      'DELETE FROM "crop_harvest_return_allocation_reversals" crar USING "sale_return_item_reversals" sri, "sale_return_reversals" srr WHERE crar."saleReturnItemReversalId" = sri.id AND sri."reversalId" = srr.id AND srr."shopId" = $1',
      shop.id,
    );
    await prisma.$executeRawUnsafe(
      'DELETE FROM "crop_harvest_return_allocations" cra USING "sale_return_items" sri, "sale_returns" sr WHERE cra."saleReturnItemId" = sri.id AND sri."saleReturnId" = sr.id AND sr."shopId" = $1',
      shop.id,
    );
    await prisma.saleReturnReversal.deleteMany({ where: { shopId: shop.id } });
    await prisma.shop.deleteMany({ where: { id: shop.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });
  const actor = { userId: user.id, role: "MERCHANT" };
  const product = await prisma.product.create({ data: { shopId: shop.id, name: "Synthetic soap", currentStock: 8, buyingPrice: 500, sellingPrice: 1000 } });
  const session = paymentMethod === "CASH" ? await prisma.cashSession.create({ data: { shopId: shop.id, openingCash: 0, openedById: `user:${user.id}`, openedByName: user.name } }) : null;
  const sale = await prisma.sale.create({
    data: { shopId: shop.id, paymentMethod, totalAmount, profit: totalAmount - 1000, cashSessionId: session?.id, items: { create: [{ productId: product.id, quantity: 2, unitPrice: 1000, totalPrice: totalAmount, buyingPrice: 500 }] } },
    include: { items: true },
  });
  const debt = paymentMethod === "CREDIT" ? await prisma.debt.create({ data: { shopId: shop.id, saleId: sale.id, customerPhone: "+255700000001", amount: totalAmount } }) : null;
  return { user: actor, shop, product, session, sale, debt };
}

test("a sale cannot be voided using a cash-shift snapshot read before that shift closes", { timeout: 15000 }, async (t) => {
  const f = await fixture(t);
  const reachedCashLock = deferred();
  const continueVoid = deferred();
  decorateNextTransaction = (tx) => new Proxy(tx, {
    get(target, key) {
      if (key !== "$queryRawUnsafe") return target[key];
      return async (...args) => {
        if (args[0].includes('"cash_sessions"')) {
          reachedCashLock.resolve();
          await continueVoid.promise;
        }
        return target.$queryRawUnsafe(...args);
      };
    },
  });
  const voiding = invoke(sales.voidSale, { user: f.user, params: { id: f.sale.id }, body: { reason: "Synthetic duplicate", paymentNotReceived: true } });
  await reachedCashLock.promise;
  let closed;
  try {
    closed = await invoke(shifts.close, { user: f.user, params: { id: f.session.id }, body: { countedCash: 2000 } });
  } finally {
    continueVoid.resolve();
  }
  const result = await voiding;
  assert.equal(closed.statusCode, 200);
  assert.equal(result.statusCode, 409, JSON.stringify(result.payload));
  assert.equal((await prisma.sale.findUnique({ where: { id: f.sale.id } })).status, "COMPLETED");
  assert.equal((await prisma.product.findUnique({ where: { id: f.product.id } })).currentStock, 8);
});

test("a concurrent debt collection prevents sale voiding from cancelling the collected debt", { timeout: 15000 }, async (t) => {
  const f = await fixture(t, "CREDIT");
  const reachedDebtWrite = deferred();
  const continueVoid = deferred();
  decorateNextTransaction = (tx) => new Proxy(tx, {
    get(target, key) {
      if (key !== "debt") return target[key];
      return new Proxy(target.debt, {
        get(model, method) {
          if (!["update", "updateMany"].includes(method)) return model[method];
          return async (...args) => {
            reachedDebtWrite.resolve();
            await continueVoid.promise;
            return model[method](...args);
          };
        },
      });
    },
  });
  const voiding = invoke(sales.voidSale, { user: f.user, params: { id: f.sale.id }, body: { reason: "Synthetic duplicate", paymentNotReceived: true } });
  await reachedDebtWrite.promise;
  let collected;
  try {
    collected = await invoke(debts.recordPayment, { user: f.user, params: { id: f.debt.id }, body: { amount: 1000, paymentMethod: "MPESA", requestKey: crypto.randomUUID() } });
  } finally {
    continueVoid.resolve();
  }
  const result = await voiding;
  assert.equal(collected.statusCode, 200);
  assert.equal(result.statusCode, 409, JSON.stringify(result.payload));
  const current = await prisma.debt.findUnique({ where: { id: f.debt.id } });
  assert.equal(current.status, "PARTIAL");
  assert.equal(current.amountPaid, 1000);
  assert.equal((await prisma.sale.findUnique({ where: { id: f.sale.id } })).status, "COMPLETED");
  assert.equal((await prisma.product.findUnique({ where: { id: f.product.id } })).currentStock, 8);
});

test("concurrent customer-return retries preserve stock, cumulative limits, rounded refunds, and Daily Close", { timeout: 15000 }, async (t) => {
  const f = await fixture(t, "CASH", 2001);
  const requestKey = crypto.randomUUID();
  const request = (key = requestKey, restockQuantity = 1) => ({
    user: f.user, params: { id: f.sale.id }, body: {
      reason: "Synthetic return", requestKey: key, refundMethod: "CASH",
      items: [{ saleItemId: f.sale.items[0].id, quantity: 1, restockQuantity, damagedQuantity: 1 - restockQuantity }],
    },
  });
  const retried = await Promise.all([invoke(returns.create, request()), invoke(returns.create, request())]);
  assert.deepEqual(retried.map((result) => result.statusCode).sort(), [200, 201]);
  assert.equal(await prisma.saleReturn.count({ where: { saleId: f.sale.id } }), 1);
  assert.equal((await prisma.product.findUnique({ where: { id: f.product.id } })).currentStock, 9);
  const second = await invoke(returns.create, request(crypto.randomUUID(), 0));
  assert.equal(second.statusCode, 201, JSON.stringify(second.payload));
  assert.equal(second.payload.saleReturn.refundAmount, 1001);
  const excessive = await invoke(returns.create, request(crypto.randomUUID()));
  assert.equal(excessive.statusCode, 409);
  assert.equal((await prisma.saleItem.findUnique({ where: { id: f.sale.items[0].id } })).returnedQuantity, 2);
  assert.equal((await prisma.product.findUnique({ where: { id: f.product.id } })).currentStock, 9);
  const summary = await shifts.summarizeSession(prisma, f.session);
  assert.equal(summary.cashSales, 2001);
  assert.equal(summary.cashRefunds, 2001);
  assert.equal(summary.cashRefundCount, 2);
  assert.equal(summary.expectedCash, 0);
  const overview = await invoke(expenses.list, { user: f.user, query: { period: "all" } });
  assert.equal(overview.statusCode, 200, JSON.stringify(overview.payload));
  assert.equal(overview.payload.summary.totalSales, 0);
  assert.equal(overview.payload.summary.grossProfit, -500);
});

test("damaged crop returns reduce cycle revenue/profit and an audited reversal restores it", { timeout: 15000 }, async (t) => {
  const f = await fixture(t, "CASH", 2000);
  const plot = await prisma.cropPlot.create({ data: { shopId: f.shop.id, name: "Synthetic return-test plot", areaMilli: 1000 } });
  const cycle = await prisma.cropCycle.create({
    data: { shopId: f.shop.id, plotId: plot.id, cropName: "Maize", plantedAt: new Date("2026-01-01T00:00:00Z"), expectedYield: 2, yieldUnit: "kg" },
  });
  const batch = await prisma.cropHarvestBatch.create({
    data: {
      shopId: f.shop.id, cropCycleId: cycle.id, outputProductId: f.product.id,
      actualYield: 2, totalCost: 1000, unitCost: 500,
      remainingQuantity: 0, remainingCost: 0, soldQuantity: 2,
      realizedRevenue: 2000, realizedCost: 1000,
    },
  });
  await prisma.cropHarvestAllocation.create({
    data: { harvestBatchId: batch.id, saleItemId: f.sale.items[0].id, quantity: 2, revenue: 2000, cost: 1000 },
  });
  const loadCropReport = async () => {
    const current = await prisma.cropCycle.findUnique({
      where: { id: cycle.id },
      include: {
        plot: true,
        inputUsages: true,
        harvestBatches: { include: { outputProduct: { select: { id: true, name: true, unit: true, sellingPrice: true } }, inputCostAllocations: true, grades: true } },
      },
    });
    return crops.reportCycle(current, true);
  };

  const returned = await invoke(returns.create, {
    user: f.user,
    params: { id: f.sale.id },
    body: {
      reason: "Synthetic damaged crop return", requestKey: crypto.randomUUID(), refundMethod: "CASH",
      items: [{ saleItemId: f.sale.items[0].id, quantity: 1, restockQuantity: 0, damagedQuantity: 1 }],
    },
  });
  assert.equal(returned.statusCode, 201, JSON.stringify(returned.payload));
  const afterDamage = await loadCropReport();
  assert.equal(afterDamage.realizedRevenue, 1000);
  assert.equal(afterDamage.realizedCost, 1000);
  assert.equal(afterDamage.realizedProfit, 0);
  assert.equal(afterDamage.soldQuantity, 1);

  const correction = {
    user: f.user,
    params: { id: f.sale.id, returnId: returned.payload.saleReturn.id },
    body: { reason: "Return was recorded against the wrong sale", recoveryMethod: "CASH", paymentRef: "SYNTHETIC-RECOVERY", requestKey: crypto.randomUUID() },
  };
  const reversed = await invoke(returns.reverse, correction);
  assert.equal(reversed.statusCode, 201, JSON.stringify(reversed.payload));
  const afterCorrection = await loadCropReport();
  assert.equal(afterCorrection.realizedRevenue, 2000);
  assert.equal(afterCorrection.realizedCost, 1000);
  assert.equal(afterCorrection.realizedProfit, 1000);
  assert.equal(afterCorrection.soldQuantity, 2);
  assert.equal((await prisma.saleItem.findUnique({ where: { id: f.sale.items[0].id } })).returnedQuantity, 0);

  const analytics = await invoke(dashboard.profitAnalytics, { user: f.user, query: { period: "month" } });
  assert.equal(analytics.statusCode, 200, JSON.stringify(analytics.payload));
  assert.equal(analytics.payload.summary.salesReturns, 1000);
  assert.equal(analytics.payload.summary.salesReturnReversals, 1000);
  assert.equal(analytics.payload.summary.netSalesRevenue, 2000);
  assert.equal(analytics.payload.summary.costOfGoodsSold, 1000);
  assert.equal(analytics.payload.summary.grossProfit, 1000);
  assert.equal(analytics.payload.summary.unitsSold, 2);

  const productReport = await invoke(productPerformance.list, { user: f.user, query: { period: "month" } });
  assert.equal(productReport.statusCode, 200, JSON.stringify(productReport.payload));
  const reportedProduct = productReport.payload.products.find((product) => product.id === f.product.id);
  assert.equal(reportedProduct.unitsSold, 2);
  assert.equal(reportedProduct.revenue, 2000);
  assert.equal(reportedProduct.grossProfit, 1000);
  const productDetail = await invoke(productPerformance.detail, { user: f.user, params: { id: f.product.id }, query: { period: "month" } });
  assert.equal(productDetail.statusCode, 200, JSON.stringify(productDetail.payload));
  assert.equal(productDetail.payload.product.unitsSold, 2);

  const summary = await shifts.summarizeSession(prisma, f.session);
  assert.equal(summary.cashRefunds, 1000);
  assert.equal(summary.cashRefundRecoveries, 1000);
  assert.equal(summary.expectedCash, 2000);
  const retry = await invoke(returns.reverse, correction);
  assert.equal(retry.statusCode, 200, JSON.stringify(retry.payload));
  assert.equal(await prisma.saleReturnReversal.count({ where: { saleReturnId: returned.payload.saleReturn.id } }), 1);
});
