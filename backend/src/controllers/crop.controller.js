const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { findOpenCashSession } = require("../lib/cashSession");
const { allocateInputCostsToHarvest, reconcileCropCycleCosts } = require("../services/cropCosting.service");
const { findCropOperationReceipt, recordCropOperationReceipt } = require("../services/cropOfflineReceipt.service");

const CYCLE_STATUSES = new Set(["PLANNED", "PLANTED", "GROWING", "HARVESTING", "CLOSED", "CANCELLED"]);
const INPUT_CATEGORIES = new Set(["SEED", "FERTILIZER", "PESTICIDE", "LABOUR", "TRANSPORT", "IRRIGATION", "OTHER"]);
const PAYMENT_METHODS = new Set(["CASH", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "HALOPESA", "BANK"]);
const AREA_UNITS = new Set(["ACRE", "HECTARE", "SQUARE_METRE"]);
const TASK_STATUSES = new Set(["TODO", "IN_PROGRESS", "DONE", "CANCELLED"]);
const TASK_PRIORITIES = new Set(["LOW", "NORMAL", "HIGH"]);
const CONTRACT_STATUSES = new Set(["DRAFT", "AGREED", "DELIVERED", "CANCELLED"]);
const WEATHER_SEVERITIES = new Set(["INFO", "WATCH", "WARNING"]);

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function canViewFinancials(req) {
  return req.user.role === "ADMIN" || !req.user.staffId || req.user.permissions?.canViewReports;
}

function shortText(value, maximum = 500) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maximum) : null;
}

function parseDate(value) {
  if (!value) return new Date();
  const text = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00.000Z`) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function optionalPositiveInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function areaMilli(value) {
  if (value === undefined || value === null || value === "") return 0;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return undefined;
  return Math.round(amount * 1000);
}

function clientRequestId(value) {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{8,100}$/.test(id) ? id : null;
}

function expectedUpdatedAt(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function assertExpectedVersion(resource, expected, label) {
  if (expected && resource.updatedAt && resource.updatedAt.getTime() !== expected.getTime()) {
    throw Object.assign(new Error(`${label} changed while this device was offline. Refresh it before trying again.`), { status: 409 });
  }
}

async function replayFieldOperation(client, { shopId, requestId, operation, resourceType, load }) {
  const receipt = await findCropOperationReceipt(client, shopId, requestId, operation);
  if (!receipt) return null;
  if (receipt.resourceType !== resourceType) {
    throw Object.assign(new Error("This offline retry key was already used for a different field record"), { status: 409 });
  }
  const resource = await load(receipt.resourceId);
  if (!resource) {
    throw Object.assign(new Error("The original field record is no longer available"), { status: 409 });
  }
  return resource;
}

function ownerCanManageFinancials(req) {
  return !req.user.staffId || req.user.role === "ADMIN";
}

function safeCycle(cycle, allowFinancials) {
  if (allowFinancials) return cycle;
  return {
    ...cycle,
    inputUsages: cycle.inputUsages?.map(({ totalCost, unitCost, ...input }) => input) || [],
    unrecoveredCost: null,
    harvestBatches: cycle.harvestBatches?.map(({ totalCost, unitCost, remainingCost, realizedRevenue, realizedCost, inputCostAllocations, ...batch }) => batch) || [],
  };
}

function outputSummary(cycle) {
  const byProduct = new Map();
  for (const batch of cycle.harvestBatches || []) {
    const existing = byProduct.get(batch.outputProductId) || {
      productId: batch.outputProductId,
      name: batch.outputProduct.name,
      unit: batch.outputProduct.unit,
      sellingPrice: batch.outputProduct.sellingPrice,
      harvestedQuantity: 0,
      remainingQuantity: 0,
      soldQuantity: 0,
      wasteQuantity: 0,
      realizedRevenue: 0,
      realizedCost: 0,
    };
    existing.harvestedQuantity += batch.actualYield;
    existing.remainingQuantity += batch.remainingQuantity;
    existing.soldQuantity += batch.soldQuantity;
    existing.wasteQuantity += batch.wasteQuantity;
    existing.realizedRevenue += batch.realizedRevenue;
    existing.realizedCost += batch.realizedCost;
    byProduct.set(batch.outputProductId, existing);
  }
  return [...byProduct.values()];
}

function reportCycle(cycle, allowFinancials) {
  const outputs = outputSummary(cycle);
  const harvestedQuantity = outputs.reduce((sum, output) => sum + output.harvestedQuantity, 0);
  const remainingQuantity = outputs.reduce((sum, output) => sum + output.remainingQuantity, 0);
  const soldQuantity = outputs.reduce((sum, output) => sum + output.soldQuantity, 0);
  const wasteQuantity = outputs.reduce((sum, output) => sum + output.wasteQuantity, 0);
  const inputCost = cycle.inputUsages.reduce((sum, input) => sum + input.totalCost, 0);
  const realizedRevenue = outputs.reduce((sum, output) => sum + output.realizedRevenue, 0);
  const realizedCost = outputs.reduce((sum, output) => sum + output.realizedCost, 0);
  const potentialUnsoldValue = outputs.reduce((sum, output) => sum + output.remainingQuantity * output.sellingPrice, 0);
  const area = cycle.plot.areaMilli / 1000;

  return {
    id: cycle.id,
    cropName: cycle.cropName,
    variety: cycle.variety,
    status: cycle.status,
    plantedAt: cycle.plantedAt,
    expectedHarvestAt: cycle.expectedHarvestAt,
    expectedYield: cycle.expectedYield,
    yieldUnit: cycle.yieldUnit,
    plot: cycle.plot,
    harvestedQuantity,
    remainingQuantity,
    soldQuantity,
    wasteQuantity,
    outputs: outputs.map((output) => allowFinancials ? output : {
      productId: output.productId,
      name: output.name,
      unit: output.unit,
      harvestedQuantity: output.harvestedQuantity,
      remainingQuantity: output.remainingQuantity,
      soldQuantity: output.soldQuantity,
      wasteQuantity: output.wasteQuantity,
    }),
    ...(allowFinancials ? {
      inputCost,
      costPerArea: area > 0 ? Math.round(inputCost / area) : null,
      realizedRevenue,
      realizedCost,
      unrecoveredCost: cycle.unrecoveredCost || 0,
      realizedProfit: realizedRevenue - realizedCost - (cycle.unrecoveredCost || 0),
      potentialUnsoldValue,
      potentialRevenue: realizedRevenue + potentialUnsoldValue,
      potentialProfit: realizedRevenue + potentialUnsoldValue - inputCost,
    } : {}),
  };
}

const overview = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const [plots, cycles, inputs, harvests] = await Promise.all([
    prisma.cropPlot.findMany({ where: { shopId }, orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }], take: 100 }),
    prisma.cropCycle.findMany({
      where: { shopId },
      include: {
        plot: { select: { id: true, name: true, location: true, areaMilli: true, areaUnit: true } },
        inputUsages: { select: { id: true, category: true, title: true, quantity: true, unitCost: true, totalCost: true, usedAt: true }, orderBy: { usedAt: "desc" } },
        harvestBatches: { include: { outputProduct: { select: { id: true, name: true, unit: true, sellingPrice: true } }, inputCostAllocations: { select: { id: true, amount: true, reason: true } }, grades: true }, orderBy: { harvestAt: "desc" } },
      },
      orderBy: [{ status: "asc" }, { plantedAt: "desc" }],
      take: 100,
    }),
    prisma.cropInputUsage.findMany({
      where: { shopId },
      include: { cropCycle: { select: { id: true, cropName: true, plot: { select: { name: true } } } }, product: { select: { id: true, name: true, unit: true } } },
      orderBy: { usedAt: "desc" },
      take: 12,
    }),
    prisma.cropHarvestBatch.findMany({
      where: { shopId },
      include: { cropCycle: { select: { id: true, cropName: true, plot: { select: { name: true } } } }, outputProduct: { select: { id: true, name: true, unit: true } } },
      orderBy: { harvestAt: "desc" },
      take: 12,
    }),
  ]);
  const financialsVisible = canViewFinancials(req);
  const report = cycles.map((cycle) => reportCycle(cycle, financialsVisible));
  const activeCycles = cycles.filter((cycle) => !["CLOSED", "CANCELLED"].includes(cycle.status));
  const totalHarvested = report.reduce((sum, row) => sum + row.harvestedQuantity, 0);
  const totalRemaining = report.reduce((sum, row) => sum + row.remainingQuantity, 0);
  const totalInputCost = financialsVisible ? report.reduce((sum, row) => sum + (row.inputCost || 0), 0) : null;

  res.json({
    plots,
    cycles: cycles.map((cycle) => safeCycle(cycle, financialsVisible)),
    report,
    recentInputs: financialsVisible ? inputs : inputs.map(({ totalCost, unitCost, ...input }) => input),
    recentHarvests: financialsVisible ? harvests : harvests.map(({ totalCost, unitCost, remainingCost, realizedRevenue, realizedCost, ...harvest }) => harvest),
    financialsVisible,
    summary: { activeCycles: activeCycles.length, plots: plots.filter((plot) => plot.isActive).length, totalHarvested, totalRemaining, totalInputCost },
  });
});

const listProducts = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const requestedLimit = Number(req.query.limit || 100);
  const take = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 100;
  const products = await prisma.product.findMany({
    where: { shopId, isActive: true },
    select: { id: true, name: true, unit: true, currentStock: true },
    orderBy: [{ name: "asc" }],
    take,
  });
  res.json({ products });
});

const createPlot = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const name = shortText(req.body.name, 120);
  const location = shortText(req.body.location, 200);
  const size = areaMilli(req.body.area);
  const areaUnit = String(req.body.areaUnit || "ACRE").toUpperCase();
  const note = shortText(req.body.note, 1000);
  if (!name || !size || !AREA_UNITS.has(areaUnit)) return res.status(400).json({ error: "Enter a plot name, valid area, and area unit" });
  const plot = await prisma.cropPlot.create({ data: { shopId, name, location, areaMilli: size, areaUnit, note } });
  req.audit = { action: "crop.plot.create", resourceType: "crop_plot", resourceId: plot.id, metadata: { areaMilli: size, areaUnit } };
  res.status(201).json({ plot });
});

const createCycle = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const plotId = String(req.body.plotId || "").trim();
  const cropName = shortText(req.body.cropName, 120);
  const variety = shortText(req.body.variety, 120);
  const plantedAt = parseDate(req.body.plantedAt);
  const expectedHarvestAt = req.body.expectedHarvestAt ? parseDate(req.body.expectedHarvestAt) : null;
  const expectedYield = optionalPositiveInteger(req.body.expectedYield);
  const yieldUnit = shortText(req.body.yieldUnit, 30);
  const note = shortText(req.body.note, 1000);
  if (!plotId || !cropName || !plantedAt || expectedYield === undefined || (expectedHarvestAt && expectedHarvestAt < plantedAt)) return res.status(400).json({ error: "Choose a plot, crop name, planting date, and valid expected harvest details" });
  const plot = await prisma.cropPlot.findFirst({ where: { id: plotId, shopId, isActive: true }, select: { id: true } });
  if (!plot) return res.status(404).json({ error: "Active crop plot not found" });
  const cycle = await prisma.cropCycle.create({ data: { shopId, plotId, cropName, variety, plantedAt, expectedHarvestAt, expectedYield: expectedYield || null, yieldUnit, note } });
  req.audit = { action: "crop.cycle.create", resourceType: "crop_cycle", resourceId: cycle.id, metadata: { plotId, cropName, expectedHarvestAt } };
  res.status(201).json({ cycle });
});

const updateCycle = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const status = String(req.body.status || "").toUpperCase();
  if (!CYCLE_STATUSES.has(status)) return res.status(400).json({ error: "Choose a valid crop cycle status" });
  if (["CLOSED", "CANCELLED"].includes(status) && !ownerCanManageFinancials(req)) {
    return res.status(403).json({ error: "Only the business owner can close or cancel a crop cycle" });
  }
  const result = await prisma.$transaction(async (tx) => {
    const cycle = await tx.cropCycle.findFirst({ where: { id: req.params.id, shopId }, select: { id: true } });
    if (!cycle) return null;
    await tx.cropCycle.update({
      where: { id: cycle.id },
      data: { status, closedAt: ["CLOSED", "CANCELLED"].includes(status) ? new Date() : null },
    });
    const reconciliation = ["CLOSED", "CANCELLED"].includes(status)
      ? await reconcileCropCycleCosts(tx, cycle.id)
      : null;
    return { cycle, reconciliation };
  });
  if (!result) return res.status(404).json({ error: "Crop cycle not found" });
  req.audit = { action: "crop.cycle.status", resourceType: "crop_cycle", resourceId: req.params.id, metadata: { status } };
  res.json({ status, reconciliation: canViewFinancials(req) ? result.reconciliation : undefined });
});

const recordInput = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const cropCycleId = String(req.body.cropCycleId || "").trim();
  const productId = String(req.body.productId || "").trim() || null;
  const category = String(req.body.category || "OTHER").toUpperCase();
  const usedAt = parseDate(req.body.usedAt);
  const paymentMethod = String(req.body.paymentMethod || "CASH").toUpperCase();
  const note = shortText(req.body.note, 1000);
  const requestId = clientRequestId(req.body.clientRequestId);
  if (!cropCycleId || !INPUT_CATEGORIES.has(category) || !usedAt || !PAYMENT_METHODS.has(paymentMethod)) return res.status(400).json({ error: "Choose a crop cycle, valid input category, date, and payment method" });

  let input;
  let reused = false;
  try {
    input = await prisma.$transaction(async (tx) => {
    if (requestId) {
      const existing = await tx.cropInputUsage.findUnique({ where: { shopId_clientRequestId: { shopId, clientRequestId: requestId } } });
      if (existing) {
        reused = true;
        return existing;
      }
    }
    const cycle = await tx.cropCycle.findFirst({ where: { id: cropCycleId, shopId, status: { notIn: ["CLOSED", "CANCELLED"] } }, select: { id: true } });
    if (!cycle) throw Object.assign(new Error("Active crop cycle not found"), { status: 404 });

    if (productId) {
      const quantity = optionalPositiveInteger(req.body.quantity);
      if (!quantity) throw Object.assign(new Error("Enter a whole input quantity"), { status: 400 });
      const product = await tx.product.findFirst({ where: { id: productId, shopId, isActive: true } });
      if (!product) throw Object.assign(new Error("Input product not found"), { status: 404 });
      const updated = await tx.product.updateMany({ where: { id: product.id, shopId, currentStock: { gte: quantity } }, data: { currentStock: { decrement: quantity } } });
      if (updated.count !== 1) throw Object.assign(new Error(`Insufficient stock for ${product.name}`), { status: 409 });
      const created = await tx.cropInputUsage.create({ data: { shopId, cropCycleId, productId: product.id, category, title: product.name, quantity, unitCost: product.buyingPrice, totalCost: product.buyingPrice * quantity, paymentMethod, note, usedAt, recordedBy: req.user.staffId || req.user.userId, clientRequestId: requestId } });
      await tx.stockMovement.create({ data: { type: "OUT", quantity, note: `Crop input #${created.id.slice(-6)}`, productId: product.id } });
      return created;
    }

    const title = shortText(req.body.title, 120);
    const totalCost = optionalPositiveInteger(req.body.totalCost);
    if (!title || !totalCost) throw Object.assign(new Error("Enter a direct input title and whole cost"), { status: 400 });
    const cashSession = paymentMethod === "CASH" ? await findOpenCashSession(tx, shopId, req.user) : null;
    return tx.cropInputUsage.create({ data: { shopId, cropCycleId, category, title, totalCost, paymentMethod, cashSessionId: cashSession?.id || null, note, usedAt, recordedBy: req.user.staffId || req.user.userId, clientRequestId: requestId } });
    });
  } catch (error) {
    if (requestId && error?.code === "P2002") {
      input = await prisma.cropInputUsage.findUnique({ where: { shopId_clientRequestId: { shopId, clientRequestId: requestId } } });
      reused = Boolean(input);
    }
    if (!input) throw error;
  }
  req.audit = { action: reused ? "crop.input.reused" : "crop.input.create", resourceType: "crop_input_usage", resourceId: input.id, metadata: { cropCycleId, productId, category, totalCost: input.totalCost } };
  res.status(reused ? 200 : 201).json({ reused, input: canViewFinancials(req) ? input : { ...input, totalCost: null, unitCost: null } });
});

const recordHarvest = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const cropCycleId = String(req.body.cropCycleId || "").trim();
  const outputProductId = String(req.body.outputProductId || "").trim();
  const actualYield = optionalPositiveInteger(req.body.actualYield);
  const expectedYield = optionalPositiveInteger(req.body.expectedYield);
  const wasteQuantity = req.body.wasteQuantity === undefined || req.body.wasteQuantity === "" ? 0 : Number(req.body.wasteQuantity);
  const harvestAt = parseDate(req.body.harvestAt);
  const note = shortText(req.body.note, 1000);
  const requestId = clientRequestId(req.body.clientRequestId);
  if (!cropCycleId || !outputProductId || !actualYield || expectedYield === undefined || !Number.isInteger(wasteQuantity) || wasteQuantity < 0 || !harvestAt) return res.status(400).json({ error: "Choose a crop cycle, output product, valid harvest quantities, and date" });

  let batch;
  let reused = false;
  try {
    batch = await prisma.$transaction(async (tx) => {
    if (requestId) {
      const existing = await tx.cropHarvestBatch.findUnique({
        where: { shopId_clientRequestId: { shopId, clientRequestId: requestId } },
        include: { outputProduct: { select: { id: true, name: true, unit: true } }, cropCycle: { select: { id: true, cropName: true } } },
      });
      if (existing) {
        reused = true;
        return existing;
      }
    }
    const cycle = await tx.cropCycle.findFirst({ where: { id: cropCycleId, shopId, status: { notIn: ["CLOSED", "CANCELLED"] } }, select: { id: true, expectedYield: true } });
    if (!cycle) throw Object.assign(new Error("Active crop cycle not found"), { status: 404 });
    const product = await tx.product.findFirst({ where: { id: outputProductId, shopId, isActive: true } });
    if (!product) throw Object.assign(new Error("Harvest output product not found"), { status: 404 });
    const [priorCycleHarvests, existingOutputHarvestCount] = await Promise.all([
      tx.cropHarvestBatch.findMany({ where: { cropCycleId, shopId }, select: { actualYield: true, expectedYield: true } }),
      tx.cropHarvestBatch.count({ where: { shopId, outputProductId } }),
    ]);
    const priorHarvestedYield = priorCycleHarvests.reduce((sum, prior) => sum + prior.actualYield, 0);
    const originalPlannedYield = priorCycleHarvests[0]?.expectedYield || null;
    const plannedYield = originalPlannedYield || Math.max(cycle.expectedYield || 0, expectedYield || 0, actualYield);
    if (priorCycleHarvests.length && ((expectedYield && expectedYield !== originalPlannedYield) || (cycle.expectedYield && cycle.expectedYield !== originalPlannedYield))) {
      throw Object.assign(new Error("The expected total yield cannot change after the first harvest because it is the cost-allocation basis."), { status: 409 });
    }
    if (priorCycleHarvests.length && plannedYield <= priorHarvestedYield) {
      throw Object.assign(new Error("Multiple harvests require an expected total yield larger than the first harvest. Start a new crop cycle for a separate planting."), { status: 400 });
    }
    if (!existingOutputHarvestCount && product.currentStock > 0) {
      throw Object.assign(new Error("Use a dedicated inventory product for this harvest. The selected product already has stock from another source."), { status: 409 });
    }
    const created = await tx.cropHarvestBatch.create({ data: { shopId, cropCycleId, outputProductId, expectedYield: plannedYield || null, actualYield, wasteQuantity, totalCost: 0, unitCost: 0, remainingQuantity: actualYield, remainingCost: 0, harvestAt, note, recordedBy: req.user.staffId || req.user.userId, clientRequestId: requestId } });
    const costing = await allocateInputCostsToHarvest(tx, {
      cropCycleId,
      harvestBatchId: created.id,
      plannedYield,
      cumulativeHarvestYield: priorHarvestedYield + actualYield,
      actualYield,
    });
    if (plannedYield > (cycle.expectedYield || 0)) await tx.cropCycle.update({ where: { id: cycle.id }, data: { expectedYield: plannedYield } });
    await tx.product.update({ where: { id: product.id }, data: { currentStock: { increment: actualYield }, buyingPrice: Math.round(costing.allocatedCost / actualYield) } });
    await tx.stockMovement.create({ data: { type: "IN", quantity: actualYield, note: `Crop harvest #${created.id.slice(-6)}${wasteQuantity ? `; waste ${wasteQuantity}` : ""}`, productId: product.id, cropHarvestBatchId: created.id } });
    await tx.cropCycle.update({ where: { id: cropCycleId }, data: { status: "HARVESTING" } });
    return tx.cropHarvestBatch.findUnique({ where: { id: created.id }, include: { outputProduct: { select: { id: true, name: true, unit: true } }, cropCycle: { select: { id: true, cropName: true } } } });
    });
  } catch (error) {
    if (requestId && error?.code === "P2002") {
      batch = await prisma.cropHarvestBatch.findUnique({
        where: { shopId_clientRequestId: { shopId, clientRequestId: requestId } },
        include: { outputProduct: { select: { id: true, name: true, unit: true } }, cropCycle: { select: { id: true, cropName: true } } },
      });
      reused = Boolean(batch);
    }
    if (!batch) throw error;
  }
  req.audit = { action: reused ? "crop.harvest.reused" : "crop.harvest.create", resourceType: "crop_harvest_batch", resourceId: batch.id, metadata: { cropCycleId, outputProductId, actualYield, wasteQuantity, totalCost: batch.totalCost } };
  res.status(reused ? 200 : 201).json({ reused, batch: canViewFinancials(req) ? batch : { ...batch, totalCost: null, unitCost: null, remainingCost: null, realizedRevenue: null, realizedCost: null } });
});

async function findCycleForShop(client, cropCycleId, shopId, select = { id: true }) {
  return client.cropCycle.findFirst({ where: { id: cropCycleId, shopId }, select });
}

function requireFinancialOwner(req, res) {
  if (ownerCanManageFinancials(req)) return true;
  res.status(403).json({ error: "Only the business owner can manage farm budgets and buyer contracts" });
  return false;
}

const operationsOverview = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const financialsVisible = canViewFinancials(req);
  const financialPlanningVisible = ownerCanManageFinancials(req);
  const [cycles, irrigationLogs, tasks, contracts, weatherAlerts, staff] = await Promise.all([
    prisma.cropCycle.findMany({
      where: { shopId },
      include: {
        plot: { select: { id: true, name: true } },
        seasonBudget: true,
        harvestBatches: {
          select: { id: true, actualYield: true, remainingQuantity: true, harvestAt: true, outputProduct: { select: { name: true, unit: true } }, grades: true },
          orderBy: { harvestAt: "desc" },
          take: 30,
        },
      },
      orderBy: [{ status: "asc" }, { expectedHarvestAt: "asc" }],
      take: 100,
    }),
    prisma.cropIrrigationLog.findMany({
      where: { shopId },
      include: { cropCycle: { select: { id: true, cropName: true, plot: { select: { name: true } } } } },
      orderBy: { irrigatedAt: "desc" },
      take: 100,
    }),
    prisma.cropFieldTask.findMany({
      where: { shopId },
      include: { cropCycle: { select: { id: true, cropName: true, plot: { select: { name: true } } } } },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.cropBuyerContract.findMany({
      where: { shopId },
      include: { cropCycle: { select: { id: true, cropName: true, plot: { select: { name: true } } } } },
      orderBy: [{ status: "asc" }, { deliveryAt: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.cropWeatherAlert.findMany({
      where: { shopId },
      include: { cropPlot: { select: { id: true, name: true } }, cropCycle: { select: { id: true, cropName: true } } },
      orderBy: [{ isResolved: "asc" }, { startsAt: "desc" }],
      take: 100,
    }),
    prisma.staffMember.findMany({ where: { shopId, isActive: true }, select: { id: true, name: true, canManageFarm: true } }),
  ]);
  const staffNames = new Map(staff.map((member) => [member.id, member.name]));

  res.json({
    financialsVisible,
    financialPlanningVisible,
    cycles: cycles.map(({ seasonBudget, ...cycle }) => ({ ...cycle, seasonBudget: financialPlanningVisible ? seasonBudget : null })),
    irrigationLogs,
    tasks: tasks.map((task) => ({ ...task, assignedStaffName: task.assignedStaffId ? staffNames.get(task.assignedStaffId) || null : null })),
    contracts: financialPlanningVisible ? contracts : [],
    weatherAlerts,
    farmStaff: staff.filter((member) => member.canManageFarm),
  });
});

const createStarterProducts = asyncHandler(async (req, res) => {
  if (!requireFinancialOwner(req, res)) return;
  const shopId = await getShopIdForUser(req.user);
  const requestedCycleId = String(req.body.cropCycleId || "").trim();
  const cycle = requestedCycleId
    ? await prisma.cropCycle.findFirst({ where: { id: requestedCycleId, shopId }, include: { plot: { select: { name: true } } } })
    : null;
  if (requestedCycleId && !cycle) return res.status(404).json({ error: "Crop cycle not found" });

  const templates = [
    { name: "Mbegu", unit: "kg", minimumStock: 1 },
    { name: "NPK Mbolea", unit: "kg", minimumStock: 1 },
    { name: "Dawa ya mimea", unit: "litre", minimumStock: 1 },
    ...(cycle ? [{ name: `${cycle.cropName} - ${cycle.plot.name}`, unit: cycle.yieldUnit || "kg", minimumStock: 0 }] : []),
  ];
  const created = await prisma.$transaction(async (tx) => {
    const result = [];
    for (const template of templates) {
      const existing = await tx.product.findFirst({ where: { shopId, name: template.name, isActive: true }, select: { id: true, name: true, unit: true } });
      if (existing) {
        result.push({ ...existing, created: false });
        continue;
      }
      const product = await tx.product.create({
        data: { shopId, name: template.name, unit: template.unit, buyingPrice: 0, sellingPrice: 0, currentStock: 0, minimumStock: template.minimumStock },
        select: { id: true, name: true, unit: true },
      });
      result.push({ ...product, created: true });
    }
    return result;
  });
  req.audit = { action: "crop.starter_products.create", resourceType: "product", resourceId: cycle?.id || shopId, metadata: { cropCycleId: cycle?.id || null, created: created.filter((product) => product.created).length } };
  res.status(201).json({ products: created });
});

const recordIrrigation = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const cropCycleId = String(req.body.cropCycleId || "").trim();
  const amount = optionalPositiveInteger(req.body.amount);
  const durationMinutes = optionalPositiveInteger(req.body.durationMinutes);
  const unit = shortText(req.body.unit, 30);
  const irrigatedAt = parseDate(req.body.irrigatedAt);
  const note = shortText(req.body.note, 1000);
  const requestId = clientRequestId(req.body.clientRequestId);
  if (!cropCycleId || !irrigatedAt || (!amount && !durationMinutes)) {
    return res.status(400).json({ error: "Choose a crop cycle, date, and either water amount or duration" });
  }

  let irrigation;
  let reused = false;
  try {
    irrigation = await prisma.$transaction(async (tx) => {
      if (requestId) {
        const existing = await tx.cropIrrigationLog.findUnique({ where: { shopId_clientRequestId: { shopId, clientRequestId: requestId } } });
        if (existing) {
          reused = true;
          return existing;
        }
      }
      const cycle = await findCycleForShop(tx, cropCycleId, shopId);
      if (!cycle) throw Object.assign(new Error("Crop cycle not found"), { status: 404 });
      return tx.cropIrrigationLog.create({ data: { shopId, cropCycleId, amount, unit: amount ? (unit || "litres") : null, durationMinutes, irrigatedAt, note, recordedBy: req.user.staffId || req.user.userId, clientRequestId: requestId } });
    });
  } catch (error) {
    if (requestId && error?.code === "P2002") {
      irrigation = await prisma.cropIrrigationLog.findUnique({ where: { shopId_clientRequestId: { shopId, clientRequestId: requestId } } });
      reused = Boolean(irrigation);
    }
    if (!irrigation) throw error;
  }
  req.audit = { action: reused ? "crop.irrigation.reused" : "crop.irrigation.create", resourceType: "crop_irrigation_log", resourceId: irrigation.id, metadata: { cropCycleId, amount, durationMinutes } };
  res.status(reused ? 200 : 201).json({ reused, irrigation });
});

const createTask = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const cropCycleId = String(req.body.cropCycleId || "").trim() || null;
  const title = shortText(req.body.title, 180);
  const priority = String(req.body.priority || "NORMAL").toUpperCase();
  const dueAt = req.body.dueAt ? parseDate(req.body.dueAt) : null;
  const note = shortText(req.body.note, 1000);
  const requestedAssignee = String(req.body.assignedStaffId || "").trim() || null;
  const requestId = clientRequestId(req.body.clientRequestId);
  if (!title || !TASK_PRIORITIES.has(priority) || (req.body.dueAt && !dueAt)) return res.status(400).json({ error: "Enter a task, valid priority, and valid due date" });

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const replay = await replayFieldOperation(tx, {
        shopId, requestId, operation: "TASK_CREATE", resourceType: "crop_field_task",
        load: (id) => tx.cropFieldTask.findFirst({ where: { id, shopId } }),
      });
      if (replay) return { task: replay, reused: true };
      if (cropCycleId && !await findCycleForShop(tx, cropCycleId, shopId)) throw Object.assign(new Error("Crop cycle not found"), { status: 404 });

      let assignedStaffId = requestedAssignee;
      if (req.user.staffId) {
        if (requestedAssignee && requestedAssignee !== req.user.staffId) throw Object.assign(new Error("Field staff can assign tasks only to themselves"), { status: 403 });
        assignedStaffId = req.user.staffId;
      } else if (assignedStaffId) {
        const member = await tx.staffMember.findFirst({ where: { id: assignedStaffId, shopId, isActive: true, canManageFarm: true }, select: { id: true } });
        if (!member) throw Object.assign(new Error("Choose an active field staff member"), { status: 400 });
      }
      const task = await tx.cropFieldTask.create({ data: { shopId, cropCycleId, title, priority, dueAt, note, assignedStaffId, recordedBy: req.user.staffId || req.user.userId } });
      await recordCropOperationReceipt(tx, { shopId, clientRequestId: requestId, operation: "TASK_CREATE", resourceType: "crop_field_task", resourceId: task.id });
      return { task, reused: false };
    });
  } catch (error) {
    if (requestId && error?.code === "P2002") {
      const replay = await replayFieldOperation(prisma, {
        shopId, requestId, operation: "TASK_CREATE", resourceType: "crop_field_task",
        load: (id) => prisma.cropFieldTask.findFirst({ where: { id, shopId } }),
      });
      if (replay) result = { task: replay, reused: true };
    }
    if (!result) throw error;
  }
  req.audit = { action: result.reused ? "crop.task.reused" : "crop.task.create", resourceType: "crop_field_task", resourceId: result.task.id, metadata: { cropCycleId, priority } };
  res.status(result.reused ? 200 : 201).json(result);
});

const updateTask = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const requestId = clientRequestId(req.body.clientRequestId);
  const expected = expectedUpdatedAt(req.body.expectedUpdatedAt);
  if (expected === undefined) return res.status(400).json({ error: "Invalid task version" });
  const requestedStatus = req.body.status === undefined ? undefined : String(req.body.status).toUpperCase();
  const requestedPriority = req.body.priority === undefined ? undefined : String(req.body.priority).toUpperCase();
  const status = requestedStatus;
  const priority = requestedPriority;
  if ((status && !TASK_STATUSES.has(status)) || (priority && !TASK_PRIORITIES.has(priority))) return res.status(400).json({ error: "Choose valid task status and priority" });

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const replay = await replayFieldOperation(tx, {
        shopId, requestId, operation: "TASK_UPDATE", resourceType: "crop_field_task",
        load: (id) => tx.cropFieldTask.findFirst({ where: { id, shopId } }),
      });
      if (replay) return { task: replay, reused: true };
      const task = await tx.cropFieldTask.findFirst({ where: { id: req.params.id, shopId } });
      if (!task) throw Object.assign(new Error("Field task not found"), { status: 404 });
      if (req.user.staffId && task.assignedStaffId !== req.user.staffId && task.recordedBy !== req.user.staffId) throw Object.assign(new Error("You can update only your own field tasks"), { status: 403 });
      const nextStatus = status || task.status;
      const nextPriority = priority || task.priority;
      if (!TASK_STATUSES.has(nextStatus) || !TASK_PRIORITIES.has(nextPriority)) throw Object.assign(new Error("Choose valid task status and priority"), { status: 400 });
      assertExpectedVersion(task, expected, "This field task");
      const updated = await tx.cropFieldTask.updateMany({
        where: { id: task.id, shopId, updatedAt: task.updatedAt },
        data: { status: nextStatus, priority: nextPriority, completedAt: nextStatus === "DONE" ? (task.completedAt || new Date()) : null },
      });
      if (updated.count !== 1) throw Object.assign(new Error("This field task changed while this device was offline. Refresh it before trying again."), { status: 409 });
      const current = await tx.cropFieldTask.findFirst({ where: { id: task.id, shopId } });
      await recordCropOperationReceipt(tx, { shopId, clientRequestId: requestId, operation: "TASK_UPDATE", resourceType: "crop_field_task", resourceId: task.id });
      return { task: current, reused: false };
    });
  } catch (error) {
    if (requestId && error?.code === "P2002") {
      const replay = await replayFieldOperation(prisma, {
        shopId, requestId, operation: "TASK_UPDATE", resourceType: "crop_field_task",
        load: (id) => prisma.cropFieldTask.findFirst({ where: { id, shopId } }),
      });
      if (replay) result = { task: replay, reused: true };
    }
    if (!result) throw error;
  }
  req.audit = { action: result.reused ? "crop.task.update_reused" : "crop.task.update", resourceType: "crop_field_task", resourceId: result.task.id, metadata: { status: result.task.status, priority: result.task.priority } };
  res.json(result);
});

const saveBudget = asyncHandler(async (req, res) => {
  if (!requireFinancialOwner(req, res)) return;
  const shopId = await getShopIdForUser(req.user);
  const cropCycleId = String(req.params.cycleId || "").trim();
  const plannedCost = req.body.plannedCost === undefined || req.body.plannedCost === "" ? 0 : Number(req.body.plannedCost);
  const plannedRevenue = req.body.plannedRevenue === undefined || req.body.plannedRevenue === "" ? null : Number(req.body.plannedRevenue);
  const note = shortText(req.body.note, 1000);
  if (!Number.isInteger(plannedCost) || plannedCost < 0 || (plannedRevenue !== null && (!Number.isInteger(plannedRevenue) || plannedRevenue < 0))) {
    return res.status(400).json({ error: "Enter whole planned cost and revenue amounts" });
  }
  if (!await findCycleForShop(prisma, cropCycleId, shopId)) return res.status(404).json({ error: "Crop cycle not found" });
  const budget = await prisma.cropSeasonBudget.upsert({ where: { cropCycleId }, create: { cropCycleId, plannedCost, plannedRevenue, note }, update: { plannedCost, plannedRevenue, note } });
  req.audit = { action: "crop.budget.save", resourceType: "crop_season_budget", resourceId: budget.id, metadata: { cropCycleId, plannedCost, plannedRevenue } };
  res.json({ budget });
});

const createBuyerContract = asyncHandler(async (req, res) => {
  if (!requireFinancialOwner(req, res)) return;
  const shopId = await getShopIdForUser(req.user);
  const cropCycleId = String(req.body.cropCycleId || "").trim() || null;
  const buyerName = shortText(req.body.buyerName, 160);
  const buyerPhone = shortText(req.body.buyerPhone, 40);
  const produceName = shortText(req.body.produceName, 160);
  const quantity = optionalPositiveInteger(req.body.quantity);
  const unit = shortText(req.body.unit, 30) || "kg";
  const unitPrice = req.body.unitPrice === undefined || req.body.unitPrice === "" ? null : Number(req.body.unitPrice);
  const deliveryAt = req.body.deliveryAt ? parseDate(req.body.deliveryAt) : null;
  const note = shortText(req.body.note, 1000);
  const requestId = clientRequestId(req.body.clientRequestId);
  if (!buyerName || !produceName || !quantity || (unitPrice !== null && (!Number.isInteger(unitPrice) || unitPrice < 0)) || (req.body.deliveryAt && !deliveryAt)) {
    return res.status(400).json({ error: "Enter buyer, produce, whole quantity, and valid delivery details" });
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const replay = await replayFieldOperation(tx, {
        shopId, requestId, operation: "BUYER_CONTRACT_CREATE", resourceType: "crop_buyer_contract",
        load: (id) => tx.cropBuyerContract.findFirst({ where: { id, shopId } }),
      });
      if (replay) return { contract: replay, reused: true };
      if (cropCycleId && !await findCycleForShop(tx, cropCycleId, shopId)) throw Object.assign(new Error("Crop cycle not found"), { status: 404 });
      const contract = await tx.cropBuyerContract.create({ data: { shopId, cropCycleId, buyerName, buyerPhone, produceName, quantity, unit, unitPrice, deliveryAt, note, recordedBy: req.user.userId } });
      await recordCropOperationReceipt(tx, { shopId, clientRequestId: requestId, operation: "BUYER_CONTRACT_CREATE", resourceType: "crop_buyer_contract", resourceId: contract.id });
      return { contract, reused: false };
    });
  } catch (error) {
    if (requestId && error?.code === "P2002") {
      const replay = await replayFieldOperation(prisma, {
        shopId, requestId, operation: "BUYER_CONTRACT_CREATE", resourceType: "crop_buyer_contract",
        load: (id) => prisma.cropBuyerContract.findFirst({ where: { id, shopId } }),
      });
      if (replay) result = { contract: replay, reused: true };
    }
    if (!result) throw error;
  }
  req.audit = { action: result.reused ? "crop.buyer_contract.reused" : "crop.buyer_contract.create", resourceType: "crop_buyer_contract", resourceId: result.contract.id, metadata: { cropCycleId, quantity, unitPrice } };
  res.status(result.reused ? 200 : 201).json(result);
});

const updateBuyerContract = asyncHandler(async (req, res) => {
  if (!requireFinancialOwner(req, res)) return;
  const shopId = await getShopIdForUser(req.user);
  const requestId = clientRequestId(req.body.clientRequestId);
  const expected = expectedUpdatedAt(req.body.expectedUpdatedAt);
  if (expected === undefined) return res.status(400).json({ error: "Invalid buyer commitment version" });
  const status = String(req.body.status || "").toUpperCase();
  if (!CONTRACT_STATUSES.has(status)) return res.status(400).json({ error: "Choose a valid buyer contract status" });
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const replay = await replayFieldOperation(tx, {
        shopId, requestId, operation: "BUYER_CONTRACT_UPDATE", resourceType: "crop_buyer_contract",
        load: (id) => tx.cropBuyerContract.findFirst({ where: { id, shopId } }),
      });
      if (replay) return { contract: replay, reused: true };
      const contract = await tx.cropBuyerContract.findFirst({ where: { id: req.params.id, shopId } });
      if (!contract) throw Object.assign(new Error("Buyer contract not found"), { status: 404 });
      assertExpectedVersion(contract, expected, "This buyer commitment");
      const updated = await tx.cropBuyerContract.updateMany({ where: { id: contract.id, shopId, updatedAt: contract.updatedAt }, data: { status } });
      if (updated.count !== 1) throw Object.assign(new Error("This buyer commitment changed while this device was offline. Refresh it before trying again."), { status: 409 });
      const current = await tx.cropBuyerContract.findFirst({ where: { id: contract.id, shopId } });
      await recordCropOperationReceipt(tx, { shopId, clientRequestId: requestId, operation: "BUYER_CONTRACT_UPDATE", resourceType: "crop_buyer_contract", resourceId: contract.id });
      return { contract: current, reused: false };
    });
  } catch (error) {
    if (requestId && error?.code === "P2002") {
      const replay = await replayFieldOperation(prisma, {
        shopId, requestId, operation: "BUYER_CONTRACT_UPDATE", resourceType: "crop_buyer_contract",
        load: (id) => prisma.cropBuyerContract.findFirst({ where: { id, shopId } }),
      });
      if (replay) result = { contract: replay, reused: true };
    }
    if (!result) throw error;
  }
  req.audit = { action: result.reused ? "crop.buyer_contract.status_reused" : "crop.buyer_contract.status", resourceType: "crop_buyer_contract", resourceId: result.contract.id, metadata: { status: result.contract.status } };
  res.json(result);
});

const recordHarvestGrade = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const harvestBatchId = String(req.params.id || "").trim();
  const grade = shortText(req.body.grade, 60);
  const quantity = optionalPositiveInteger(req.body.quantity);
  const unit = shortText(req.body.unit, 30);
  const note = shortText(req.body.note, 500);
  const requestId = clientRequestId(req.body.clientRequestId);
  const expected = expectedUpdatedAt(req.body.expectedUpdatedAt);
  if (expected === undefined) return res.status(400).json({ error: "Invalid harvest grade version" });
  if (!harvestBatchId || !grade || !quantity) return res.status(400).json({ error: "Enter a grade and whole quantity" });
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const replay = await replayFieldOperation(tx, {
        shopId, requestId, operation: "HARVEST_GRADE_SAVE", resourceType: "crop_harvest_grade",
        load: (id) => tx.cropHarvestGrade.findFirst({ where: { id, harvestBatch: { shopId } } }),
      });
      if (replay) return { grade: replay, reused: true };
      const batch = await tx.cropHarvestBatch.findFirst({ where: { id: harvestBatchId, shopId }, select: { id: true, actualYield: true, outputProduct: { select: { unit: true } } } });
      if (!batch) throw Object.assign(new Error("Harvest batch not found"), { status: 404 });
      const [grades, existing] = await Promise.all([
        tx.cropHarvestGrade.findMany({ where: { harvestBatchId: batch.id }, select: { id: true, grade: true, quantity: true } }),
        tx.cropHarvestGrade.findFirst({ where: { harvestBatchId: batch.id, grade } }),
      ]);
      const gradedOtherThanCurrent = grades.filter((row) => row.grade !== grade).reduce((sum, row) => sum + row.quantity, 0);
      if (gradedOtherThanCurrent + quantity > batch.actualYield) throw Object.assign(new Error("Grades cannot exceed harvested quantity"), { status: 409 });
      let saved;
      if (existing) {
        assertExpectedVersion(existing, expected, "This harvest grade");
        const updated = await tx.cropHarvestGrade.updateMany({
          where: { id: existing.id, updatedAt: existing.updatedAt },
          data: { quantity, unit: unit || batch.outputProduct.unit, note, recordedBy: req.user.staffId || req.user.userId },
        });
        if (updated.count !== 1) throw Object.assign(new Error("This harvest grade changed while this device was offline. Refresh it before trying again."), { status: 409 });
        saved = await tx.cropHarvestGrade.findUnique({ where: { id: existing.id } });
      } else {
        saved = await tx.cropHarvestGrade.create({ data: { harvestBatchId: batch.id, grade, quantity, unit: unit || batch.outputProduct.unit, note, recordedBy: req.user.staffId || req.user.userId } });
      }
      await recordCropOperationReceipt(tx, { shopId, clientRequestId: requestId, operation: "HARVEST_GRADE_SAVE", resourceType: "crop_harvest_grade", resourceId: saved.id });
      return { grade: saved, reused: false };
    });
  } catch (error) {
    if (requestId && error?.code === "P2002") {
      const replay = await replayFieldOperation(prisma, {
        shopId, requestId, operation: "HARVEST_GRADE_SAVE", resourceType: "crop_harvest_grade",
        load: (id) => prisma.cropHarvestGrade.findFirst({ where: { id, harvestBatch: { shopId } } }),
      });
      if (replay) result = { grade: replay, reused: true };
    }
    if (!result) throw error;
  }
  req.audit = { action: result.reused ? "crop.harvest.grade_reused" : "crop.harvest.grade", resourceType: "crop_harvest_grade", resourceId: result.grade.id, metadata: { harvestBatchId, grade, quantity } };
  res.status(result.reused ? 200 : 201).json(result);
});

const createWeatherAlert = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const cropPlotId = String(req.body.cropPlotId || "").trim() || null;
  const cropCycleId = String(req.body.cropCycleId || "").trim() || null;
  const type = shortText(req.body.type, 60) || "WEATHER";
  const severity = String(req.body.severity || "INFO").toUpperCase();
  const message = shortText(req.body.message, 500);
  const startsAt = parseDate(req.body.startsAt);
  const expiresAt = req.body.expiresAt ? parseDate(req.body.expiresAt) : null;
  const requestId = clientRequestId(req.body.clientRequestId);
  if (!message || !startsAt || !WEATHER_SEVERITIES.has(severity) || (req.body.expiresAt && (!expiresAt || expiresAt < startsAt))) {
    return res.status(400).json({ error: "Enter a weather observation, severity, and valid dates" });
  }
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const replay = await replayFieldOperation(tx, {
        shopId, requestId, operation: "WEATHER_ALERT_CREATE", resourceType: "crop_weather_alert",
        load: (id) => tx.cropWeatherAlert.findFirst({ where: { id, shopId } }),
      });
      if (replay) return { alert: replay, reused: true };
      if (cropPlotId) {
        const plot = await tx.cropPlot.findFirst({ where: { id: cropPlotId, shopId }, select: { id: true } });
        if (!plot) throw Object.assign(new Error("Crop plot not found"), { status: 404 });
      }
      if (cropCycleId && !await findCycleForShop(tx, cropCycleId, shopId)) throw Object.assign(new Error("Crop cycle not found"), { status: 404 });
      const alert = await tx.cropWeatherAlert.create({ data: { shopId, cropPlotId, cropCycleId, type, severity, message, source: "MANUAL", startsAt, expiresAt, recordedBy: req.user.staffId || req.user.userId } });
      await recordCropOperationReceipt(tx, { shopId, clientRequestId: requestId, operation: "WEATHER_ALERT_CREATE", resourceType: "crop_weather_alert", resourceId: alert.id });
      return { alert, reused: false };
    });
  } catch (error) {
    if (requestId && error?.code === "P2002") {
      const replay = await replayFieldOperation(prisma, {
        shopId, requestId, operation: "WEATHER_ALERT_CREATE", resourceType: "crop_weather_alert",
        load: (id) => prisma.cropWeatherAlert.findFirst({ where: { id, shopId } }),
      });
      if (replay) result = { alert: replay, reused: true };
    }
    if (!result) throw error;
  }
  req.audit = { action: result.reused ? "crop.weather_alert.reused" : "crop.weather_alert.create", resourceType: "crop_weather_alert", resourceId: result.alert.id, metadata: { cropPlotId, cropCycleId, severity } };
  res.status(result.reused ? 200 : 201).json(result);
});

const updateWeatherAlert = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const requestId = clientRequestId(req.body.clientRequestId);
  const expected = expectedUpdatedAt(req.body.expectedUpdatedAt);
  if (expected === undefined) return res.status(400).json({ error: "Invalid weather observation version" });
  if (typeof req.body.isResolved !== "boolean") return res.status(400).json({ error: "Choose whether the weather observation is resolved" });
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const replay = await replayFieldOperation(tx, {
        shopId, requestId, operation: "WEATHER_ALERT_UPDATE", resourceType: "crop_weather_alert",
        load: (id) => tx.cropWeatherAlert.findFirst({ where: { id, shopId } }),
      });
      if (replay) return { alert: replay, reused: true };
      const alert = await tx.cropWeatherAlert.findFirst({ where: { id: req.params.id, shopId } });
      if (!alert) throw Object.assign(new Error("Weather observation not found"), { status: 404 });
      assertExpectedVersion(alert, expected, "This weather observation");
      const updated = await tx.cropWeatherAlert.updateMany({
        where: { id: alert.id, shopId, updatedAt: alert.updatedAt },
        data: { isResolved: req.body.isResolved, resolvedAt: req.body.isResolved ? new Date() : null },
      });
      if (updated.count !== 1) throw Object.assign(new Error("This weather observation changed while this device was offline. Refresh it before trying again."), { status: 409 });
      const current = await tx.cropWeatherAlert.findFirst({ where: { id: alert.id, shopId } });
      await recordCropOperationReceipt(tx, { shopId, clientRequestId: requestId, operation: "WEATHER_ALERT_UPDATE", resourceType: "crop_weather_alert", resourceId: alert.id });
      return { alert: current, reused: false };
    });
  } catch (error) {
    if (requestId && error?.code === "P2002") {
      const replay = await replayFieldOperation(prisma, {
        shopId, requestId, operation: "WEATHER_ALERT_UPDATE", resourceType: "crop_weather_alert",
        load: (id) => prisma.cropWeatherAlert.findFirst({ where: { id, shopId } }),
      });
      if (replay) result = { alert: replay, reused: true };
    }
    if (!result) throw error;
  }
  req.audit = { action: result.reused ? "crop.weather_alert.resolve_reused" : "crop.weather_alert.resolve", resourceType: "crop_weather_alert", resourceId: result.alert.id, metadata: { isResolved: result.alert.isResolved } };
  res.json(result);
});

module.exports = {
  overview, listProducts, createPlot, createCycle, updateCycle, recordInput, recordHarvest,
  operationsOverview, createStarterProducts, recordIrrigation, createTask, updateTask,
  saveBudget, createBuyerContract, updateBuyerContract, recordHarvestGrade, createWeatherAlert,
  updateWeatherAlert, reportCycle, canViewFinancials,
};
