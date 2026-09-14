const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const prisma = require("../src/lib/prisma");
const { anonymizeMerchantAccount } = require("../src/services/accountDeletion.service");
const { queueForShop } = require("../src/services/push.service");

test.after(async () => {
  await prisma.$disconnect();
});

const databaseUrl = String(process.env.DATABASE_URL || "");
if (!/localhost|127\.0\.0\.1|dukapilot_test/i.test(databaseUrl)) {
  throw new Error("PostgreSQL integrity tests require an explicitly named local test database");
}

test("merchant deletion anonymizes a business with branches and retained financial records", async (t) => {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({ data: { phone: `deleted-test-${suffix}`, pin: "not-a-real-pin", name: "Synthetic deletion owner" } });
  const root = await prisma.shop.create({ data: { name: "Synthetic root", location: "Test", userId: user.id, referralCode: `root-${suffix}` } });
  const branch = await prisma.shop.create({ data: { name: "Synthetic branch", location: "Test", parentShopId: root.id, referralCode: `branch-${suffix}` } });
  const customer = await prisma.customer.create({ data: { shopId: branch.id, name: "Synthetic customer", phone: "+255700000001", email: `customer-${suffix}@example.test` } });
  const staff = await prisma.staffMember.create({ data: { shopId: branch.id, name: "Synthetic private staff", phone: `+255${suffix.replace(/\D/g, "").slice(0, 9).padEnd(9, "1")}`, pin: "not-a-real-pin", role: "CASHIER" } });
  const product = await prisma.product.create({ data: { shopId: branch.id, name: "Owner surname product", buyingPrice: 1000, sellingPrice: 1500 } });
  const stockMovement = await prisma.stockMovement.create({ data: { productId: product.id, type: "ADJUSTMENT", quantity: 1, note: "Counted by private staff name" } });
  const expense = await prisma.expense.create({ data: { shopId: branch.id, title: "Owner home delivery", vendor: "Private person", note: "Private address", amount: 1000 } });
  const report = await prisma.report.create({ data: { userId: user.id, title: "Private shop issue", description: "Private customer detail" } });
  const debt = await prisma.debt.create({ data: { shopId: branch.id, customerName: customer.name, customerPhone: customer.phone, amount: 10000, amountPaid: 3000, status: "PARTIAL" } });
  await prisma.debtPayment.create({ data: { debtId: debt.id, amount: 3000, requestKey: crypto.randomUUID() } });
  const payment = await prisma.subscriptionPayment.create({ data: { shopId: root.id, plan: "PRO", amount: 35000, reference: suffix, normalizedReference: `TEST:${suffix}` } });
  const checkout = await prisma.subscriptionCheckout.create({ data: { shopId: root.id, requestKey: crypto.randomUUID(), plan: "PRO", amount: 35000, phone: "+255700000001", status: "REVIEW" } });
  const quotationSettings = await prisma.quotationSettings.create({ data: { shopId: branch.id, defaultPaymentTerms: "Pay private person", defaultTerms: "Private terms", defaultCustomerNote: "Private note", signatureName: "Owner private name", signatureUrl: "https://files.example.test/private-signature.png" } });
  const quotation = await prisma.quotation.create({ data: { shopId: branch.id, quotationNumber: `QT-${suffix}`, projectTitle: "Private customer home", customerId: customer.id, createdById: user.id, lastEditedById: user.id } });
  const quotationSection = await prisma.quotationSection.create({ data: { quotationId: quotation.id, name: "Customer private room", position: 1 } });
  const quotationItem = await prisma.quotationItem.create({ data: { quotationId: quotation.id, sectionId: quotationSection.id, position: 1, name: "Customer-name cabinet", description: "Private dimensions", internalNote: "Private note", unitPrice: 1000, lineSubtotal: 1000, totalSellingPrice: 1000 } });
  const recipe = await prisma.foodRecipe.create({ data: { shopId: branch.id, outputProductId: product.id, name: "Owner family recipe", instructions: "Private cooking notes", expectedYield: 1 } });
  const foodBatch = await prisma.foodPreparationBatch.create({ data: { shopId: branch.id, recipeId: recipe.id, outputProductId: product.id, expectedYield: 1, actualYield: 1, ingredientCost: 0, totalCost: 0, unitCost: 0, additionalCostNote: "Paid private cook", note: "Private food note", preparedBy: "Private staff" } });
  const farmGroup = await prisma.farmGroup.create({ data: { shopId: branch.id, profileType: "LAYERS", name: "Owner family flock", note: "Private farm address", currentAnimals: 10 } });
  const farmEvent = await prisma.farmAnimalEvent.create({ data: { groupId: farmGroup.id, type: "OPENING", quantity: 10, note: "Private vet", recordedBy: "Private worker" } });
  const farmBatch = await prisma.farmProductionBatch.create({ data: { shopId: branch.id, groupId: farmGroup.id, outputProductId: product.id, expectedYield: 5, actualYield: 5, ingredientCost: 0, totalCost: 0, unitCost: 0, additionalCostNote: "Private payment", note: "Private batch", producedBy: "Private worker" } });
  const farmPack = await prisma.farmPackConversion.create({ data: { shopId: branch.id, inputProductId: product.id, outputProductId: product.id, inputQuantity: 1, outputQuantity: 1, totalCost: 0, unitCost: 0, note: "Private pack note", convertedBy: "Private worker" } });
  const cropPlot = await prisma.cropPlot.create({ data: { shopId: branch.id, name: "Private family field", location: "Private village", areaMilli: 1000, note: "Private plot note" } });
  const cropCycle = await prisma.cropCycle.create({ data: { shopId: branch.id, plotId: cropPlot.id, cropName: "Private maize crop", variety: "Private variety", plantedAt: new Date("2026-01-01"), note: "Private crop note" } });
  const cropInput = await prisma.cropInputUsage.create({ data: { shopId: branch.id, cropCycleId: cropCycle.id, category: "LABOUR", title: "Private field worker", totalCost: 5000, note: "Private input note", recordedBy: "Private worker" } });
  const cropHarvest = await prisma.cropHarvestBatch.create({ data: { shopId: branch.id, cropCycleId: cropCycle.id, outputProductId: product.id, actualYield: 10, totalCost: 5000, unitCost: 500, remainingQuantity: 10, remainingCost: 5000, note: "Private harvest note", recordedBy: "Private worker" } });
  const cropCostAllocation = await prisma.cropInputCostAllocation.create({ data: { cropInputUsageId: cropInput.id, harvestBatchId: cropHarvest.id, amount: 5000 } });
  const cropBudget = await prisma.cropSeasonBudget.create({ data: { cropCycleId: cropCycle.id, plannedCost: 9000, plannedRevenue: 16000, note: "Private seasonal budget" } });
  const irrigation = await prisma.cropIrrigationLog.create({ data: { shopId: branch.id, cropCycleId: cropCycle.id, amount: 100, unit: "litres", note: "Private water schedule", recordedBy: "Private worker" } });
  const fieldTask = await prisma.cropFieldTask.create({ data: { shopId: branch.id, cropCycleId: cropCycle.id, title: "Private task", note: "Private task note", assignedStaffId: staff.id, recordedBy: "Private worker" } });
  const buyerContract = await prisma.cropBuyerContract.create({ data: { shopId: branch.id, cropCycleId: cropCycle.id, buyerName: "Private buyer", buyerPhone: "+255700000099", produceName: "Private maize", quantity: 5, unitPrice: 3000, note: "Private buyer note", recordedBy: "Private owner" } });
  const harvestGrade = await prisma.cropHarvestGrade.create({ data: { harvestBatchId: cropHarvest.id, grade: "A", quantity: 10, unit: "kg", note: "Private grading note", recordedBy: "Private worker" } });
  const weatherAlert = await prisma.cropWeatherAlert.create({ data: { shopId: branch.id, cropPlotId: cropPlot.id, cropCycleId: cropCycle.id, severity: "WARNING", message: "Private weather observation", recordedBy: "Private worker" } });

  t.after(async () => {
    await prisma.cropWeatherAlert.deleteMany({ where: { id: weatherAlert.id } });
    await prisma.cropHarvestGrade.deleteMany({ where: { id: harvestGrade.id } });
    await prisma.cropBuyerContract.deleteMany({ where: { id: buyerContract.id } });
    await prisma.cropFieldTask.deleteMany({ where: { id: fieldTask.id } });
    await prisma.cropIrrigationLog.deleteMany({ where: { id: irrigation.id } });
    await prisma.cropSeasonBudget.deleteMany({ where: { id: cropBudget.id } });
    await prisma.cropInputCostAllocation.deleteMany({ where: { id: cropCostAllocation.id } });
    await prisma.cropHarvestBatch.deleteMany({ where: { id: cropHarvest.id } });
    await prisma.cropInputUsage.deleteMany({ where: { id: cropInput.id } });
    await prisma.cropCycle.deleteMany({ where: { id: cropCycle.id } });
    await prisma.cropPlot.deleteMany({ where: { id: cropPlot.id } });
    await prisma.farmPackConversion.deleteMany({ where: { id: farmPack.id } });
    await prisma.farmProductionBatch.deleteMany({ where: { id: farmBatch.id } });
    await prisma.farmAnimalEvent.deleteMany({ where: { id: farmEvent.id } });
    await prisma.farmGroup.deleteMany({ where: { id: farmGroup.id } });
    await prisma.foodPreparationBatch.deleteMany({ where: { id: foodBatch.id } });
    await prisma.foodRecipe.deleteMany({ where: { id: recipe.id } });
    await prisma.quotationItem.deleteMany({ where: { id: quotationItem.id } });
    await prisma.quotationSection.deleteMany({ where: { id: quotationSection.id } });
    await prisma.quotation.deleteMany({ where: { id: quotation.id } });
    await prisma.quotationSettings.deleteMany({ where: { id: quotationSettings.id } });
    await prisma.stockMovement.deleteMany({ where: { id: stockMovement.id } });
    await prisma.subscriptionCheckout.deleteMany({ where: { id: checkout.id } });
    await prisma.subscriptionPayment.deleteMany({ where: { id: payment.id } });
    await prisma.shop.deleteMany({ where: { id: branch.id } });
    await prisma.shop.deleteMany({ where: { id: root.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });

  await anonymizeMerchantAccount(user.id);
  const [accountAfter, rootAfter, branchAfter, customerAfter, staffAfter, debtAfter, productAfter, expenseAfter, reportAfter, paymentAfter, checkoutAfter, quotationSettingsAfter, quotationSectionAfter, quotationItemAfter, stockMovementAfter, recipeAfter, foodBatchAfter, farmGroupAfter, farmEventAfter, farmBatchAfter, farmPackAfter, cropPlotAfter, cropCycleAfter, cropInputAfter, cropHarvestAfter, cropBudgetAfter, irrigationAfter, fieldTaskAfter, buyerContractAfter, harvestGradeAfter, weatherAlertAfter] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id } }),
    prisma.shop.findUnique({ where: { id: root.id } }),
    prisma.shop.findUnique({ where: { id: branch.id } }),
    prisma.customer.findUnique({ where: { id: customer.id } }),
    prisma.staffMember.findUnique({ where: { id: staff.id } }),
    prisma.debt.findUnique({ where: { id: debt.id } }),
    prisma.product.findUnique({ where: { id: product.id } }),
    prisma.expense.findUnique({ where: { id: expense.id } }),
    prisma.report.findUnique({ where: { id: report.id } }),
    prisma.subscriptionPayment.findUnique({ where: { id: payment.id } }),
    prisma.subscriptionCheckout.findUnique({ where: { id: checkout.id } }),
    prisma.quotationSettings.findUnique({ where: { id: quotationSettings.id } }),
    prisma.quotationSection.findUnique({ where: { id: quotationSection.id } }),
    prisma.quotationItem.findUnique({ where: { id: quotationItem.id } }),
    prisma.stockMovement.findUnique({ where: { id: stockMovement.id } }),
    prisma.foodRecipe.findUnique({ where: { id: recipe.id } }),
    prisma.foodPreparationBatch.findUnique({ where: { id: foodBatch.id } }),
    prisma.farmGroup.findUnique({ where: { id: farmGroup.id } }),
    prisma.farmAnimalEvent.findUnique({ where: { id: farmEvent.id } }),
    prisma.farmProductionBatch.findUnique({ where: { id: farmBatch.id } }),
    prisma.farmPackConversion.findUnique({ where: { id: farmPack.id } }),
    prisma.cropPlot.findUnique({ where: { id: cropPlot.id } }),
    prisma.cropCycle.findUnique({ where: { id: cropCycle.id } }),
    prisma.cropInputUsage.findUnique({ where: { id: cropInput.id } }),
    prisma.cropHarvestBatch.findUnique({ where: { id: cropHarvest.id } }),
    prisma.cropSeasonBudget.findUnique({ where: { id: cropBudget.id } }),
    prisma.cropIrrigationLog.findUnique({ where: { id: irrigation.id } }),
    prisma.cropFieldTask.findUnique({ where: { id: fieldTask.id } }),
    prisma.cropBuyerContract.findUnique({ where: { id: buyerContract.id } }),
    prisma.cropHarvestGrade.findUnique({ where: { id: harvestGrade.id } }),
    prisma.cropWeatherAlert.findUnique({ where: { id: weatherAlert.id } }),
  ]);

  assert.match(accountAfter.phone, /^deleted-/);
  assert.equal(rootAfter.userId, user.id);
  assert.equal(rootAfter.isActive, false);
  assert.equal(branchAfter.isActive, false);
  assert.equal(branchAfter.branchArchived, true);
  assert.equal(customerAfter.phone, null);
  assert.equal(staffAfter.name, "Deleted staff");
  assert.equal(staffAfter.phone, null);
  assert.equal(debtAfter.customerPhone, "deleted");
  assert.equal(productAfter.name, "Deleted product");
  assert.equal(productAfter.isActive, false);
  assert.equal(expenseAfter.vendor, null);
  assert.equal(reportAfter.description, "Account deleted");
  assert.equal(paymentAfter.amount, 35000);
  assert.equal(checkoutAfter.status, "REVIEW");
  assert.equal(quotationSettingsAfter.signatureName, null);
  assert.equal(quotationSettingsAfter.signatureUrl, null);
  assert.equal(quotationSectionAfter.name, "Deleted section");
  assert.equal(quotationItemAfter.name, "Deleted quotation item");
  assert.equal(stockMovementAfter.note, null);
  assert.equal(recipeAfter.name, "Deleted recipe");
  assert.equal(foodBatchAfter.preparedBy, null);
  assert.equal(farmGroupAfter.name, "Deleted group");
  assert.equal(farmEventAfter.recordedBy, null);
  assert.equal(farmBatchAfter.producedBy, null);
  assert.equal(farmPackAfter.convertedBy, null);
  assert.equal(cropPlotAfter.name, "Deleted plot");
  assert.equal(cropPlotAfter.location, null);
  assert.equal(cropCycleAfter.cropName, "Deleted crop");
  assert.equal(cropCycleAfter.variety, null);
  assert.equal(cropInputAfter.title, "Deleted crop input");
  assert.equal(cropInputAfter.recordedBy, null);
  assert.equal(cropHarvestAfter.note, null);
  assert.equal(cropHarvestAfter.recordedBy, null);
  assert.equal(cropBudgetAfter, null);
  assert.equal(irrigationAfter, null);
  assert.equal(fieldTaskAfter, null);
  assert.equal(buyerContractAfter, null);
  assert.equal(weatherAlertAfter, null);
  assert.equal(harvestGradeAfter.note, null);
  assert.equal(harvestGradeAfter.recordedBy, null);
});

test("debt collection guard rejects a concurrent debt amount change", async (t) => {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({ data: { phone: `debt-race-${suffix}`, pin: "not-a-real-pin", name: "Synthetic debt owner" } });
  const shop = await prisma.shop.create({ data: { name: "Debt race shop", location: "Test", userId: user.id, referralCode: `debt-${suffix}` } });
  const debt = await prisma.debt.create({ data: { shopId: shop.id, customerPhone: "+255700000010", amount: 10000, amountPaid: 0, status: "OPEN" } });
  t.after(async () => {
    await prisma.shop.deleteMany({ where: { id: shop.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });

  let releaseRead;
  let signalRead;
  const readComplete = new Promise((resolve) => { signalRead = resolve; });
  const continuePayment = new Promise((resolve) => { releaseRead = resolve; });
  const paymentAttempt = prisma.$transaction(async (tx) => {
    const snapshot = await tx.debt.findUnique({ where: { id: debt.id } });
    signalRead();
    await continuePayment;
    return tx.debt.updateMany({
      where: { id: debt.id, shopId: shop.id, amount: snapshot.amount, amountPaid: snapshot.amountPaid, status: snapshot.status },
      data: { amountPaid: 3000, status: "PARTIAL" },
    });
  });

  await readComplete;
  await prisma.debt.update({ where: { id: debt.id }, data: { amount: 2000 } });
  releaseRead();
  const guarded = await paymentAttempt;
  const current = await prisma.debt.findUnique({ where: { id: debt.id } });

  assert.equal(guarded.count, 0);
  assert.equal(current.amount, 2000);
  assert.equal(current.amountPaid, 0);
});

test("stock count guard preserves stock changed while a count is open", async (t) => {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({ data: { phone: `stock-race-${suffix}`, pin: "not-a-real-pin", name: "Synthetic stock owner" } });
  const shop = await prisma.shop.create({ data: { name: "Stock race shop", location: "Test", userId: user.id, referralCode: `stock-${suffix}` } });
  const product = await prisma.product.create({ data: { shopId: shop.id, name: "Counted product", buyingPrice: 1000, sellingPrice: 1500, currentStock: 10 } });
  const count = await prisma.stockCount.create({ data: { shopId: shop.id, createdById: user.id, items: { create: [{ productId: product.id, expected: 10, counted: 9 }] } } });
  t.after(async () => {
    await prisma.shop.deleteMany({ where: { id: shop.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });

  await prisma.product.update({ where: { id: product.id }, data: { currentStock: 8 } });
  const guarded = await prisma.product.updateMany({ where: { id: product.id, shopId: shop.id, currentStock: 10 }, data: { currentStock: 9 } });
  const [productAfter, countAfter] = await Promise.all([
    prisma.product.findUnique({ where: { id: product.id } }),
    prisma.stockCount.findUnique({ where: { id: count.id } }),
  ]);

  assert.equal(guarded.count, 0);
  assert.equal(productAfter.currentStock, 8);
  assert.equal(countAfter.status, "OPEN");
});

test("push queue and history queries enforce live staff permissions", async (t) => {
  const suffix = crypto.randomUUID();
  const user = await prisma.user.create({ data: { phone: `push-test-${suffix}`, pin: "not-a-real-pin", name: "Synthetic push owner" } });
  const shop = await prisma.shop.create({ data: { name: "Push test shop", location: "Test", userId: user.id, referralCode: `push-${suffix}` } });
  const stockStaff = await prisma.staffMember.create({ data: { shopId: shop.id, name: "Stock staff", phone: `stock-${suffix}`, pin: "x", role: "STOCK_CLERK", canManageStock: true } });
  const cashier = await prisma.staffMember.create({ data: { shopId: shop.id, name: "Cashier", phone: `cash-${suffix}`, pin: "x", role: "CASHIER", canManageStock: false } });
  const ownerSubscription = await prisma.pushSubscription.create({ data: { shopId: shop.id, userId: user.id, endpoint: `https://push.example/${suffix}/owner`, p256dh: "p", auth: "a", deviceId: `owner-${suffix}` } });
  const stockSubscription = await prisma.pushSubscription.create({ data: { shopId: shop.id, userId: user.id, staffId: stockStaff.id, endpoint: `https://push.example/${suffix}/stock`, p256dh: "p", auth: "a", deviceId: `stock-${suffix}` } });
  await prisma.pushSubscription.create({ data: { shopId: shop.id, userId: user.id, staffId: cashier.id, endpoint: `https://push.example/${suffix}/cash`, p256dh: "p", auth: "a", deviceId: `cash-${suffix}` } });
  t.after(async () => {
    await prisma.shop.deleteMany({ where: { id: shop.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });

  await queueForShop(shop.id, "LOW_STOCK", { title: "Stock update", body: "Private product", href: "/inventory" });
  const queued = await prisma.pushDelivery.findMany({ where: { shopId: shop.id }, orderBy: { subscriptionId: "asc" } });
  const staffHistory = await prisma.pushDelivery.findMany({ where: { shopId: shop.id, subscription: { staffId: stockStaff.id }, kind: { in: ["LOW_STOCK"] } } });

  assert.deepEqual(new Set(queued.map((item) => item.subscriptionId)), new Set([ownerSubscription.id, stockSubscription.id]));
  assert.equal(staffHistory.length, 1);
  assert.equal(staffHistory[0].subscriptionId, stockSubscription.id);
});
