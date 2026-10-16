const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const prisma = require("../src/lib/prisma");

const databaseUrl = String(process.env.DATABASE_URL || "");
if (!/localhost|127\.0\.0\.1|dukapilot_test/i.test(databaseUrl)) {
  throw new Error("Supplier payable integrity tests require an explicitly named local test database");
}

let activeShopId;
const shopAccessPath = require.resolve("../src/lib/shopAccess");
const cachePath = require.resolve("../src/services/dashboard-cache.service");
require.cache[shopAccessPath] = {
  id: shopAccessPath,
  filename: shopAccessPath,
  loaded: true,
  exports: { getShopIdForUser: async () => activeShopId },
};
require.cache[cachePath] = {
  id: cachePath,
  filename: cachePath,
  loaded: true,
  exports: { invalidateDashboardHistory: async () => {} },
};

const stockReceiptController = require("../src/controllers/stockReceipt.controller");
const orderController = require("../src/controllers/order.controller");
const supplierPayableController = require("../src/controllers/supplierPayable.controller");
const cashSessionController = require("../src/controllers/cashSession.controller");

test.after(async () => prisma.$disconnect());

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

async function invoke(handler, req) {
  const res = response();
  await handler(req, res, (error) => {
    if (error) res.status(error.status || 500).json({ error: error.message });
  });
  return res;
}

function receiveRequest(orderId, productId, quantity) {
  return {
    user: { userId: "synthetic-owner" },
    body: {
      requestKey: crypto.randomUUID(),
      sourceOrderId: orderId,
      paymentMethod: "CASH",
      paidAtReceipt: 0,
      items: [{ productId, quantity, unitCost: 1000 }],
    },
  };
}

test("supplier purchasing keeps partial stock receipts, payments, returns, retries, and branch scope consistent", async (t) => {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({ data: { phone: `payable-${suffix}`, pin: "test-only", name: "Synthetic payable owner" } });
  const root = await prisma.shop.create({ data: { userId: user.id, name: "Payable test shop", location: "Test", referralCode: `payable-${suffix}` } });
  const branch = await prisma.shop.create({ data: { parentShopId: root.id, name: "Payable test branch", location: "Test", referralCode: `payable-branch-${suffix}` } });
  const supplier = await prisma.supplier.create({ data: { name: "Synthetic supplier", phone: `supplier-${suffix}`, createdByShopId: root.id } });
  const product = await prisma.product.create({ data: { shopId: root.id, name: "Synthetic stock", buyingPrice: 1000, sellingPrice: 1500, currentStock: 0 } });
  const order = await prisma.order.create({
    data: { shopId: root.id, supplierId: supplier.id, status: "CONFIRMED", totalAmount: 5000, items: { create: [{ productId: product.id, quantity: 5, unitPrice: 1000 }] } },
    include: { items: true },
  });
  activeShopId = root.id;
  t.after(async () => {
    await prisma.stockReceiptPaymentCorrection.deleteMany({ where: { shopId: root.id } });
    await prisma.supplierPaymentAllocation.deleteMany({ where: { supplierPayment: { shopId: root.id } } });
    await prisma.supplierReturnStatusEvent.deleteMany({ where: { shopId: root.id } });
    await prisma.supplierCreditLine.deleteMany({ where: { supplierCredit: { shopId: root.id } } });
    await prisma.supplierCredit.deleteMany({ where: { shopId: root.id } });
    await prisma.supplierPayment.deleteMany({ where: { shopId: root.id } });
    await prisma.stockReceipt.deleteMany({ where: { shopId: root.id } });
    await prisma.order.deleteMany({ where: { shopId: root.id } });
    await prisma.shop.deleteMany({ where: { id: branch.id } });
    await prisma.shop.deleteMany({ where: { id: root.id } });
    await prisma.supplier.deleteMany({ where: { id: supplier.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });

  const firstReceiptResponse = await invoke(stockReceiptController.receive, receiveRequest(order.id, product.id, 2));
  assert.equal(firstReceiptResponse.statusCode, 201);
  const firstReceiptId = firstReceiptResponse.payload.receipt.id;
  let [productAfterFirst, orderAfterFirst] = await Promise.all([
    prisma.product.findUnique({ where: { id: product.id } }),
    prisma.order.findUnique({ where: { id: order.id }, include: { items: true } }),
  ]);
  assert.equal(productAfterFirst.currentStock, 2);
  assert.equal(orderAfterFirst.status, "PARTIALLY_RECEIVED");
  assert.equal(orderAfterFirst.items[0].receivedQuantity, 2);

  const secondReceiptResponse = await invoke(stockReceiptController.receive, receiveRequest(order.id, product.id, 3));
  assert.equal(secondReceiptResponse.statusCode, 201);
  const secondReceiptId = secondReceiptResponse.payload.receipt.id;
  const overReceipt = await invoke(stockReceiptController.receive, receiveRequest(order.id, product.id, 1));
  assert.equal(overReceipt.statusCode, 409);
  const [productAfterAll, orderAfterAll] = await Promise.all([
    prisma.product.findUnique({ where: { id: product.id } }),
    prisma.order.findUnique({ where: { id: order.id }, include: { items: true } }),
  ]);
  assert.equal(productAfterAll.currentStock, 5);
  assert.equal(orderAfterAll.status, "DELIVERED");
  assert.equal(orderAfterAll.items[0].receivedQuantity, 5);

  const paymentRequest = {
    user: { userId: user.id },
    body: { requestKey: crypto.randomUUID(), amount: 500, paymentMethod: "MPESA", allocations: [{ stockReceiptId: firstReceiptId, amount: 500 }] },
  };
  const payment = await invoke(supplierPayableController.recordPayment, paymentRequest);
  const paymentRetry = await invoke(supplierPayableController.recordPayment, paymentRequest);
  assert.equal(payment.statusCode, 201);
  assert.equal(paymentRetry.statusCode, 200);
  assert.equal(paymentRetry.payload.reused, true);
  assert.equal(await prisma.supplierPayment.count({ where: { shopId: root.id } }), 1);

  const competingRequests = [500, 500].map((amount) => ({
    user: { userId: user.id },
    body: { requestKey: crypto.randomUUID(), amount, paymentMethod: "MPESA", allocations: [{ stockReceiptId: firstReceiptId, amount }] },
  }));
  const competingPayments = await Promise.all(competingRequests.map((request) => invoke(supplierPayableController.recordPayment, request)));
  const concurrentSuccesses = competingPayments.filter((result) => result.statusCode === 201).length;
  assert.ok(concurrentSuccesses === 1 || concurrentSuccesses === 2);
  const conflictedRequest = competingRequests[competingPayments.findIndex((result) => result.statusCode === 409)];
  if (conflictedRequest) {
    const retriedPayment = await invoke(supplierPayableController.recordPayment, conflictedRequest);
    assert.equal(retriedPayment.statusCode, 201);
  }
  const overpayment = await invoke(supplierPayableController.recordPayment, {
    user: { userId: user.id },
    body: { requestKey: crypto.randomUUID(), amount: 2000, paymentMethod: "MPESA", allocations: [{ stockReceiptId: firstReceiptId, amount: 2000 }] },
  });
  assert.equal(overpayment.statusCode, 409);

  const firstReceiptLine = await prisma.stockReceiptItem.findFirst({ where: { stockReceiptId: firstReceiptId } });
  const overReturn = await invoke(supplierPayableController.recordCredit, {
    user: { userId: user.id },
    body: { stockReceiptId: firstReceiptId, requestKey: crypto.randomUUID(), kind: "RETURN", items: [{ stockReceiptItemId: firstReceiptLine.id, quantity: 3 }] },
  });
  assert.equal(overReturn.statusCode, 409);
  const stockBeforeReturn = (await prisma.product.findUnique({ where: { id: product.id } })).currentStock;
  const returned = await invoke(supplierPayableController.recordCredit, {
    user: { userId: user.id },
    body: { stockReceiptId: firstReceiptId, requestKey: crypto.randomUUID(), kind: "RETURN", items: [{ stockReceiptItemId: firstReceiptLine.id, quantity: 1 }] },
  });
  assert.equal(returned.statusCode, 201);
  assert.equal(await prisma.stockMovement.count({ where: { supplierCreditLineId: { in: returned.payload.credit.items.map((item) => item.id) }, type: "OUT" } }), 1);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).currentStock, stockBeforeReturn - 1);
  const reversedCredit = await invoke(supplierPayableController.reverseCredit, {
    user: { userId: user.id },
    params: { creditId: returned.payload.credit.id },
    body: { requestKey: crypto.randomUUID() },
  });
  assert.equal(reversedCredit.statusCode, 201);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).currentStock, stockBeforeReturn);
  assert.equal(await prisma.stockMovement.count({ where: { supplierCreditLineId: { in: reversedCredit.payload.credit.items.map((item) => item.id) }, type: "IN" } }), 1);

  const secondReturn = await invoke(supplierPayableController.recordCredit, {
    user: { userId: user.id },
    body: { stockReceiptId: firstReceiptId, requestKey: crypto.randomUUID(), kind: "RETURN", items: [{ stockReceiptItemId: firstReceiptLine.id, quantity: 1 }] },
  });
  assert.equal(secondReturn.statusCode, 201);
  const stockBeforeReturnStatusChanges = (await prisma.product.findUnique({ where: { id: product.id } })).currentStock;
  const creditCountBeforeReturnStatusChanges = await prisma.supplierCredit.count({ where: { shopId: root.id } });
  const paymentCountBeforeReturnStatusChanges = await prisma.supplierPayment.count({ where: { shopId: root.id } });
  const initialReturnStatus = await prisma.supplierReturnStatusEvent.findFirst({ where: { supplierCreditId: secondReturn.payload.credit.id } });
  assert.equal(initialReturnStatus.status, "RECORDED");
  const handedOver = await invoke(supplierPayableController.updateReturnStatus, {
    user: { userId: user.id },
    params: { creditId: secondReturn.payload.credit.id },
    body: { requestKey: crypto.randomUUID(), status: "HANDED_OVER", reference: "SYNTHETIC-COURIER-REF" },
  });
  assert.equal(handedOver.statusCode, 201);
  const acknowledged = await invoke(supplierPayableController.updateReturnStatus, {
    user: { userId: user.id },
    params: { creditId: secondReturn.payload.credit.id },
    body: { requestKey: crypto.randomUUID(), status: "SUPPLIER_ACKNOWLEDGED", note: "Supplier confirmed receipt" },
  });
  assert.equal(acknowledged.statusCode, 201);
  const statusHistory = await prisma.supplierReturnStatusEvent.findMany({ where: { supplierCreditId: secondReturn.payload.credit.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  assert.deepEqual(statusHistory.map((event) => event.status), ["RECORDED", "HANDED_OVER", "SUPPLIER_ACKNOWLEDGED"]);
  assert.equal((await prisma.product.findUnique({ where: { id: product.id } })).currentStock, stockBeforeReturnStatusChanges);
  assert.equal(await prisma.supplierCredit.count({ where: { shopId: root.id } }), creditCountBeforeReturnStatusChanges);
  assert.equal(await prisma.supplierPayment.count({ where: { shopId: root.id } }), paymentCountBeforeReturnStatusChanges);
  const supplierRefundRequest = {
    user: { userId: user.id },
    body: { stockReceiptId: firstReceiptId, requestKey: crypto.randomUUID(), amount: 300, paymentMethod: "MPESA", paymentReference: "SUPPLIER-REFUND-1" },
  };
  const supplierRefund = await invoke(supplierPayableController.recordRefund, supplierRefundRequest);
  assert.equal(supplierRefund.statusCode, 201);
  assert.equal(supplierRefund.payload.payment.kind, "REFUND");
  assert.equal(supplierRefund.payload.payment.amount, -300);
  assert.equal(supplierRefund.payload.payment.allocations[0].amount, -300);
  const supplierRefundRetry = await invoke(supplierPayableController.recordRefund, supplierRefundRequest);
  assert.equal(supplierRefundRetry.statusCode, 200);
  assert.equal(supplierRefundRetry.payload.reused, true);

  activeShopId = branch.id;
  const branchReceipts = await invoke(supplierPayableController.receipts, { user: { userId: user.id }, params: { supplierId: supplier.id }, query: {} });
  assert.equal(branchReceipts.statusCode, 200);
  assert.equal(branchReceipts.payload.receipts.length, 0);
  const crossBranchRefund = await invoke(supplierPayableController.recordRefund, {
    user: { userId: user.id },
    body: { stockReceiptId: firstReceiptId, requestKey: crypto.randomUUID(), amount: 100, paymentMethod: "MPESA" },
  });
  assert.equal(crossBranchRefund.statusCode, 404);
  const crossBranchReturnStatus = await invoke(supplierPayableController.updateReturnStatus, {
    user: { userId: user.id },
    params: { creditId: secondReturn.payload.credit.id },
    body: { requestKey: crypto.randomUUID(), status: "DISPUTED", note: "Should not access root branch return" },
  });
  assert.equal(crossBranchReturnStatus.statusCode, 404);

  activeShopId = root.id;
  const rootReceipts = await invoke(supplierPayableController.receipts, { user: { userId: user.id }, params: { supplierId: supplier.id }, query: {} });
  assert.equal(rootReceipts.payload.receipts.length, 2);
  assert.equal(rootReceipts.payload.receipts.find((receipt) => receipt.id === firstReceiptId).balance, -200);
  assert.equal(rootReceipts.payload.receipts.find((receipt) => receipt.id === secondReceiptId).balance, 3000);

  const cashSession = await prisma.cashSession.create({ data: { shopId: root.id, openedById: `user:${user.id}`, openedByName: "Synthetic owner", openingCash: 2000 } });
  const corrected = await invoke(supplierPayableController.correctReceiptPayment, {
    user: { userId: user.id },
    params: { receiptId: secondReceiptId },
    body: { requestKey: crypto.randomUUID(), correctedAmount: 750, paymentMethod: "CASH", note: "Synthetic correction test" },
  });
  assert.equal(corrected.statusCode, 201);
  assert.equal(corrected.payload.correction.cashOutAdjustment, 750);
  assert.equal(corrected.payload.correction.cashSessionId, cashSession.id);
  const correctedReceipts = await invoke(supplierPayableController.receipts, { user: { userId: user.id }, params: { supplierId: supplier.id }, query: {} });
  assert.equal(correctedReceipts.payload.receipts.find((receipt) => receipt.id === secondReceiptId).balance, 2250);
  const closeSummary = await cashSessionController.summarizeSession(prisma, cashSession);
  assert.equal(closeSummary.receiptPaymentCorrectionCashOut, 750);
  assert.equal(closeSummary.expectedCash, 1250);

  const raceOrder = await prisma.order.create({
    data: { shopId: root.id, supplierId: supplier.id, status: "CONFIRMED", totalAmount: 1000, items: { create: [{ productId: product.id, quantity: 1, unitPrice: 1000 }] } },
    include: { items: true },
  });
  const stockBeforeRace = (await prisma.product.findUnique({ where: { id: product.id } })).currentStock;
  const [raceCancellation, raceReceipt] = await Promise.all([
    invoke(orderController.cancel, { user: { userId: user.id }, params: { id: raceOrder.id } }),
    invoke(stockReceiptController.receive, receiveRequest(raceOrder.id, product.id, 1)),
  ]);
  const [raceOrderAfter, productAfterRace] = await Promise.all([
    prisma.order.findUnique({ where: { id: raceOrder.id }, include: { items: true } }),
    prisma.product.findUnique({ where: { id: product.id } }),
  ]);
  if (raceOrderAfter.status === "DELIVERED") {
    assert.equal(raceCancellation.statusCode, 400);
    assert.equal(raceReceipt.statusCode, 201);
    assert.equal(raceOrderAfter.items[0].receivedQuantity, 1);
    assert.equal(productAfterRace.currentStock, stockBeforeRace + 1);
  } else {
    assert.equal(raceOrderAfter.status, "CANCELLED");
    assert.equal(raceCancellation.statusCode, 200);
    assert.equal(raceReceipt.statusCode, 409);
    assert.equal(raceOrderAfter.items[0].receivedQuantity, 0);
    assert.equal(productAfterRace.currentStock, stockBeforeRace);
  }
});
