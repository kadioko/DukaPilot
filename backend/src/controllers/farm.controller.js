const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { findOpenCashSession } = require("../lib/cashSession");
const { getFarmConfiguration } = require("../lib/farmAccess");
const { weightedAverageCost } = require("../lib/weightedAverageCost");
const { startOfTanzaniaDay } = require("../lib/businessTime");

const PROFILE_TYPES = new Set(["LAYERS", "BROILERS", "DAIRY", "BEEF", "GOATS_SHEEP", "PIGS", "MIXED"]);
const EVENT_TYPES = new Set(["ADDITION", "MORTALITY", "CULL"]);
const PRODUCTION_TYPES = new Set(["EGGS", "MILK", "HARVEST", "OTHER"]);
const EGG_STOCK_MODES = new Set(["EGGS", "TRAYS"]);
const PAYMENT_METHODS = new Set(["CASH", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "HALOPESA", "BANK"]);

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function canViewFinancials(req) {
  return req.user.role === "ADMIN" || !req.user.staffId || req.user.permissions?.canViewReports;
}

function parseDate(value) {
  if (!value) return new Date();
  const text = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00.000Z`) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shortText(value, maximum = 500) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maximum) : null;
}

function clientRequestId(value) {
  const id = String(value || "").trim();
  return /^[a-zA-Z0-9_-]{8,100}$/.test(id) ? id : null;
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const seen = new Set();
  const items = rawItems.map((item) => ({
    productId: String(item.productId || "").trim(),
    quantity: Number(item.quantity),
  }));
  if (items.some((item) => !item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0 || Math.abs(item.quantity - Math.round(item.quantity * 1000) / 1000) > 1e-9)) return null;
  if (items.some((item) => seen.has(item.productId) || !seen.add(item.productId))) return null;
  return items;
}

function costsFor(items, additionalCost, actualYield, expectedYield, brokenQuantity = 0) {
  const ingredientCost = items.reduce((sum, item) => sum + Math.round(item.quantity * item.unitCost), 0);
  const totalCost = ingredientCost + additionalCost;
  const usableYield = actualYield - brokenQuantity;
  return {
    ingredientCost,
    totalCost,
    unitCost: Math.round(totalCost / usableYield),
    wasteQuantity: Math.max(0, expectedYield - actualYield),
  };
}

function roundQuantity(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

function redactBatch(batch, req) {
  if (canViewFinancials(req)) return batch;
  return {
    ...batch,
    ingredientCost: null,
    additionalCost: null,
    totalCost: null,
    unitCost: null,
    items: batch.items.map((item) => ({ ...item, unitCost: null, totalCost: null })),
  };
}

function redactConversion(conversion, req) {
  if (canViewFinancials(req)) return conversion;
  return { ...conversion, totalCost: null, unitCost: null };
}

function batchInclude() {
  return {
    group: { select: { id: true, name: true, profileType: true } },
    outputProduct: { select: { id: true, name: true, unit: true } },
    items: { include: { product: { select: { id: true, name: true, unit: true } } } },
    autoPackConversion: { select: { id: true, inputQuantity: true, outputQuantity: true, outputProduct: { select: { id: true, name: true, unit: true } } } },
  };
}

function dateBoundary(value, end = false) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return new Date(utc - 3 * 60 * 60 * 1000 + (end ? 86400000 : 0));
}

const overview = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12));
  const search = String(req.query.search || "").trim().slice(0, 100);
  const groupId = String(req.query.groupId || "").trim();
  const type = String(req.query.type || "").trim().toUpperCase();
  const from = req.query.from ? dateBoundary(req.query.from) : null;
  const to = req.query.to ? dateBoundary(req.query.to, true) : null;
  if ((req.query.from && !from) || (req.query.to && !to) || (from && to && (from >= to || to.getTime() - from.getTime() > 366 * 86400000))) {
    return res.status(400).json({ error: "Enter a valid production history date range (maximum one year)" });
  }
  if (type && !PRODUCTION_TYPES.has(type)) return res.status(400).json({ error: "Invalid production type" });
  const batchWhere = {
    shopId,
    ...(groupId ? { groupId } : {}),
    ...(type ? { type } : {}),
    ...(from || to ? { producedAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    ...(search ? { OR: [
      { outputProduct: { name: { contains: search, mode: "insensitive" } } },
      { group: { name: { contains: search, mode: "insensitive" } } },
      { note: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [configuration, profiles, groups, batches, totalBatches, recentConversions, production, losses] = await Promise.all([
    getFarmConfiguration(shopId),
    prisma.farmProfile.findMany({ where: { shopId }, orderBy: { type: "asc" } }),
    prisma.farmGroup.findMany({ where: { shopId }, include: { liveProduct: { select: { id: true, name: true, unit: true, currentStock: true } } }, orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }], take: 100 }),
    prisma.farmProductionBatch.findMany({ where: batchWhere, include: batchInclude(), orderBy: { producedAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.farmProductionBatch.count({ where: batchWhere }),
    prisma.farmPackConversion.findMany({
      where: { shopId },
      include: { inputProduct: { select: { id: true, name: true, unit: true } }, outputProduct: { select: { id: true, name: true, unit: true } } },
      orderBy: { convertedAt: "desc" },
      take: 8,
    }),
    prisma.farmProductionBatch.aggregate({ where: { shopId, producedAt: { gte: since } }, _sum: { actualYield: true, brokenQuantity: true, wasteQuantity: true, totalCost: true }, _count: { id: true } }),
    prisma.farmAnimalEvent.aggregate({ where: { group: { shopId }, type: { in: ["MORTALITY", "CULL"] }, occurredAt: { gte: since } }, _sum: { quantity: true } }),
  ]);

  res.json({
    configuration,
    profiles,
    groups,
    batches: batches.map((batch) => redactBatch(batch, req)),
    conversions: recentConversions.map((conversion) => redactConversion(conversion, req)),
    pagination: { page, limit, total: totalBatches, totalPages: Math.max(1, Math.ceil(totalBatches / limit)) },
    summary: {
      days: 30,
      activeGroups: groups.filter((group) => group.isActive).length,
      animals: groups.filter((group) => group.isActive).reduce((sum, group) => sum + group.currentAnimals, 0),
      productionCount: production._count.id,
      outputQuantity: (production._sum.actualYield || 0) - (production._sum.brokenQuantity || 0),
      brokenEggs: production._sum.brokenQuantity || 0,
      wasteQuantity: (production._sum.wasteQuantity || 0) + (production._sum.brokenQuantity || 0),
      lossAnimals: losses._sum.quantity || 0,
      ...(canViewFinancials(req) ? { productionCost: production._sum.totalCost || 0 } : {}),
    },
  });
});

const listProducts = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const search = String(req.query.search || "").trim().slice(0, 100);
  const products = await prisma.product.findMany({
    where: { shopId, isActive: true, ...(search ? { name: { contains: search, mode: "insensitive" } } : {}) },
    select: { id: true, name: true, unit: true, currentStock: true, isInternalUse: true },
    orderBy: [{ name: "asc" }],
    take: Math.min(100, Math.max(1, Number(req.query.limit) || 20)),
  });
  res.json({ products });
});

const saveConfiguration = asyncHandler(async (req, res) => {
  if (req.user.staffId) return res.status(403).json({ error: "Only the business owner can change farm setup" });
  const shopId = await getShopIdForUser(req.user);
  const hasLivestock = req.body.hasLivestock === true;
  const hasCrops = req.body.hasCrops === true;
  if (!hasLivestock && !hasCrops) return res.status(400).json({ error: "Choose crops, livestock, or both" });
  const configuration = await prisma.farmSettings.upsert({
    where: { shopId },
    create: { shopId, hasLivestock, hasCrops },
    update: { hasLivestock, hasCrops },
  });
  req.audit = { action: "farm.configuration.save", resourceType: "farm_settings", resourceId: configuration.id, metadata: { hasLivestock, hasCrops } };
  res.json({ configuration: { ...configuration, isFarm: true, needsSetup: false, category: "farm" } });
});

const saveProfiles = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const types = Array.isArray(req.body.types) ? [...new Set(req.body.types.map((type) => String(type).toUpperCase()))] : [];
  if (!types.length || types.some((type) => !PROFILE_TYPES.has(type))) return res.status(400).json({ error: "Choose one or more valid farm profiles" });

  const profiles = await prisma.$transaction(async (tx) => {
    await tx.farmProfile.updateMany({ where: { shopId, type: { notIn: types } }, data: { isActive: false } });
    for (const type of types) {
      await tx.farmProfile.upsert({ where: { shopId_type: { shopId, type } }, create: { shopId, type, isActive: true }, update: { isActive: true } });
    }
    return tx.farmProfile.findMany({ where: { shopId }, orderBy: { type: "asc" } });
  });
  req.audit = { action: "farm.profiles.save", resourceType: "farm_profile", resourceId: shopId, metadata: { types } };
  res.json({ profiles });
});

const createGroup = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const name = shortText(req.body.name, 120);
  const profileType = String(req.body.profileType || "").toUpperCase();
  const currentAnimals = Number(req.body.currentAnimals || 0);
  const note = shortText(req.body.note, 1000);
  if (!name || !PROFILE_TYPES.has(profileType) || !Number.isInteger(currentAnimals) || currentAnimals < 0) {
    return res.status(400).json({ error: "Enter a group name, valid profile, and whole opening animal count" });
  }

  const group = await prisma.$transaction(async (tx) => {
    const profile = await tx.farmProfile.findFirst({ where: { shopId, type: profileType, isActive: true }, select: { id: true } });
    if (!profile) throw Object.assign(new Error("Enable this farm profile before adding a group"), { status: 400 });
    return tx.farmGroup.create({
      data: {
        shopId,
        profileType,
        name,
        currentAnimals,
        note,
        ...(currentAnimals ? { events: { create: { type: "OPENING", quantity: currentAnimals, note: "Opening count", recordedBy: req.user.staffId || req.user.userId } } } : {}),
      },
    });
  });
  req.audit = { action: "farm.group.create", resourceType: "farm_group", resourceId: group.id, metadata: { profileType, currentAnimals } };
  res.status(201).json({ group });
});

const setLiveProduct = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const productId = String(req.body.productId || "").trim() || null;
  const group = await prisma.$transaction(async (tx) => {
    const current = await tx.farmGroup.findFirst({ where: { id: req.params.id, shopId }, select: { id: true, currentAnimals: true, liveProductId: true, isActive: true } });
    if (!current) throw Object.assign(new Error("Farm group not found"), { status: 404 });
    if (!current.isActive && productId) throw Object.assign(new Error("Activate this animal group before linking a sale product"), { status: 409 });
    if (!productId) {
      await tx.farmGroup.update({ where: { id: current.id }, data: { liveProductId: null } });
    } else {
      const product = await tx.product.findFirst({ where: { id: productId, shopId, isActive: true }, select: { id: true, name: true, currentStock: true } });
      if (!product) throw Object.assign(new Error("Choose an active inventory product from this shop"), { status: 400 });
      if (current.liveProductId && current.liveProductId !== productId) {
        throw Object.assign(new Error("Unlink the current live-animal product before choosing another one"), { status: 409 });
      }
      if (product.currentStock !== 0 && product.currentStock !== current.currentAnimals) {
        throw Object.assign(new Error(`The product currently has ${product.currentStock} in stock while this group has ${current.currentAnimals}. Use a dedicated live-animal product with matching stock.`), { status: 409 });
      }
      await tx.farmGroup.update({ where: { id: current.id }, data: { liveProductId: product.id } });
      if (product.currentStock === 0 && current.currentAnimals > 0) {
        await tx.product.update({ where: { id: product.id }, data: { currentStock: current.currentAnimals } });
        await tx.stockMovement.create({ data: { type: "IN", quantity: current.currentAnimals, note: `Opening live-animal stock: ${current.id}`, productId: product.id } });
      }
    }
    return tx.farmGroup.findUnique({ where: { id: current.id }, include: { liveProduct: { select: { id: true, name: true, unit: true, currentStock: true } } } });
  }).catch((error) => {
    if (error?.code === "P2002") throw Object.assign(new Error("This product is already linked to another animal group"), { status: 409 });
    throw error;
  });
  req.audit = { action: "farm.live_product.set", resourceType: "farm_group", resourceId: group.id, metadata: { productId } };
  res.json({ group });
});

const recordAnimalEvent = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const type = String(req.body.type || "").toUpperCase();
  const quantity = Number(req.body.quantity);
  const occurredAt = parseDate(req.body.occurredAt);
  const note = shortText(req.body.note, 1000);
  const requestId = clientRequestId(req.body.clientRequestId);
  if (req.body.clientRequestId && !requestId) return res.status(400).json({ error: "Invalid livestock retry key" });
  if (!EVENT_TYPES.has(type) || !Number.isInteger(quantity) || quantity <= 0 || !occurredAt) return res.status(400).json({ error: "Choose a valid event, whole quantity, and date" });

  let result;
  let reused = false;
  try {
    result = await prisma.$transaction(async (tx) => {
      if (requestId) {
        const existing = await tx.farmAnimalEvent.findUnique({ where: { groupId_clientRequestId: { groupId: req.params.id, clientRequestId: requestId } } });
        if (existing) {
          reused = true;
          return { event: existing, group: await tx.farmGroup.findUnique({ where: { id: existing.groupId } }) };
        }
      }
      const group = await tx.farmGroup.findFirst({ where: { id: req.params.id, shopId }, select: { id: true, currentAnimals: true, liveProductId: true } });
      if (!group) throw Object.assign(new Error("Farm group not found"), { status: 404 });
      const decrement = type === "MORTALITY" || type === "CULL";
      const updated = await tx.farmGroup.updateMany({
        where: { id: group.id, shopId, ...(decrement ? { currentAnimals: { gte: quantity } } : {}) },
        data: { currentAnimals: decrement ? { decrement: quantity } : { increment: quantity } },
      });
      if (updated.count !== 1) throw Object.assign(new Error(decrement ? "This event would reduce the group below zero animals" : "The group changed before this event was saved"), { status: 409 });
      if (group.liveProductId) {
        const productUpdate = await tx.product.updateMany({
          where: { id: group.liveProductId, shopId, ...(decrement ? { currentStock: { gte: quantity } } : {}) },
          data: { currentStock: decrement ? { decrement: quantity } : { increment: quantity } },
        });
        if (productUpdate.count !== 1) throw Object.assign(new Error("The linked live-animal product stock no longer matches this group. Refresh before recording the event."), { status: 409 });
        await tx.stockMovement.create({ data: { type: decrement ? "OUT" : "IN", quantity, note: `Livestock ${type.toLowerCase()}: ${group.id}`, productId: group.liveProductId } });
      }
      const event = await tx.farmAnimalEvent.create({ data: { groupId: group.id, type, quantity, occurredAt, note, recordedBy: req.user.staffId || req.user.userId, clientRequestId: requestId } });
      const updatedGroup = await tx.farmGroup.findUnique({ where: { id: group.id }, include: { liveProduct: { select: { id: true, name: true, unit: true, currentStock: true } } } });
      return { event, group: updatedGroup };
    });
  } catch (error) {
    if (!requestId || error?.code !== "P2002") throw error;
    const event = await prisma.farmAnimalEvent.findUnique({ where: { groupId_clientRequestId: { groupId: req.params.id, clientRequestId: requestId } } });
    if (!event) throw error;
    reused = true;
    result = { event, group: await prisma.farmGroup.findUnique({ where: { id: event.groupId }, include: { liveProduct: { select: { id: true, name: true, unit: true, currentStock: true } } } }) };
  }
  req.audit = { action: reused ? "farm.animal_event.reused" : "farm.animal_event.create", resourceType: "farm_group", resourceId: req.params.id, metadata: { type, quantity } };
  res.status(reused ? 200 : 201).json({ ...result, reused });
});

const createProduction = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const groupId = String(req.body.groupId || "").trim();
  const outputProductId = String(req.body.outputProductId || "").trim();
  const trayProductId = String(req.body.trayProductId || "").trim();
  const type = String(req.body.type || "OTHER").toUpperCase();
  const eggStockMode = String(req.body.eggStockMode || "EGGS").toUpperCase();
  const expectedYield = Number(req.body.expectedYield);
  const actualYield = Number(req.body.actualYield);
  const brokenQuantity = Number(req.body.brokenQuantity || 0);
  const additionalCost = Number(req.body.additionalCost || 0);
  const paymentMethod = String(req.body.paymentMethod || "CASH").toUpperCase();
  const producedAt = parseDate(req.body.producedAt);
  const additionalCostNote = shortText(req.body.additionalCostNote, 500);
  const note = shortText(req.body.note, 1000);
  const requestId = clientRequestId(req.body.clientRequestId);
  if (req.body.clientRequestId && !requestId) return res.status(400).json({ error: "Invalid livestock retry key" });
  const requestedItems = normalizeItems(req.body.items);
  if (!groupId || !outputProductId || !PRODUCTION_TYPES.has(type) || !EGG_STOCK_MODES.has(eggStockMode) || (type !== "EGGS" && (brokenQuantity !== 0 || eggStockMode !== "EGGS" || trayProductId)) || (eggStockMode === "TRAYS" && !trayProductId) || (eggStockMode === "EGGS" && trayProductId) || !Number.isInteger(expectedYield) || expectedYield <= 0 || !Number.isInteger(actualYield) || actualYield <= 0 || !Number.isInteger(brokenQuantity) || brokenQuantity < 0 || brokenQuantity >= actualYield || !Number.isInteger(additionalCost) || additionalCost < 0 || !PAYMENT_METHODS.has(paymentMethod) || !producedAt || requestedItems === null) {
    return res.status(400).json({ error: "Choose a group, output, valid yields, costs, payment method, date, and valid supplies" });
  }
  if (!requestedItems.length && additionalCost === 0) return res.status(400).json({ error: "Add supplies used or a direct production cost so the output cost is meaningful" });

  let reused = false;
  let batch;
  try {
    batch = await prisma.$transaction(async (tx) => {
    if (requestId) {
      const existing = await tx.farmProductionBatch.findUnique({ where: { shopId_clientRequestId: { shopId, clientRequestId: requestId } }, include: batchInclude() });
      if (existing) { reused = true; return existing; }
    }
    const group = await tx.farmGroup.findFirst({ where: { id: groupId, shopId, isActive: true }, select: { id: true, profileType: true } });
    if (!group) throw Object.assign(new Error("Active farm group not found"), { status: 404 });
    const productIds = [outputProductId, ...(trayProductId ? [trayProductId] : []), ...requestedItems.map((item) => item.productId)];
    if (new Set(productIds).size !== productIds.length) throw Object.assign(new Error("Egg, tray, and supply products must be different"), { status: 400 });
    const products = await tx.product.findMany({ where: { shopId, isActive: true, id: { in: productIds } }, include: { livestockGroup: { select: { id: true } } } });
    if (products.length !== productIds.length) throw Object.assign(new Error("One or more products do not belong to this farm"), { status: 400 });
    const productMap = new Map(products.map((product) => [product.id, product]));
    if (productMap.get(outputProductId).livestockGroup) throw Object.assign(new Error("A live-animal sale product cannot be used as a production output"), { status: 400 });
    if (type === "EGGS" && /tray|trei/i.test(productMap.get(outputProductId).unit || "")) throw Object.assign(new Error("Choose a single-egg product as the base output. Trays are packed separately."), { status: 400 });
    if (trayProductId && productMap.get(trayProductId).livestockGroup) throw Object.assign(new Error("A live-animal sale product cannot be used as a tray output"), { status: 400 });
    for (const item of requestedItems) {
      const product = productMap.get(item.productId);
      if (product.currentStock < item.quantity) throw Object.assign(new Error(`Insufficient supply stock for ${product.name}`), { status: 409 });
    }
    const costItems = requestedItems.map((item) => ({ ...item, unitCost: productMap.get(item.productId).buyingPrice }));
    const usableYield = actualYield - brokenQuantity;
    const costs = costsFor(costItems, additionalCost, actualYield, expectedYield, brokenQuantity);
    const cashSession = additionalCost > 0 && paymentMethod === "CASH" ? await findOpenCashSession(tx, shopId, req.user) : null;
    const created = await tx.farmProductionBatch.create({
      data: {
        shopId, groupId, outputProductId, type, expectedYield, actualYield, brokenQuantity, eggStockMode, wasteQuantity: costs.wasteQuantity,
        ingredientCost: costs.ingredientCost, additionalCost, totalCost: costs.totalCost, unitCost: costs.unitCost,
        additionalCostNote, paymentMethod, cashSessionId: cashSession?.id || null, note, producedAt, producedBy: req.user.staffId || req.user.userId,
        items: { create: costItems.map((item) => ({ productId: item.productId, quantity: item.quantity, unitCost: item.unitCost, totalCost: Math.round(item.quantity * item.unitCost) })) },
        clientRequestId: requestId,
      },
    });
    for (const item of requestedItems) {
      const product = productMap.get(item.productId);
      const updated = await tx.product.updateMany({ where: { id: item.productId, shopId, AND: [{ currentStock: product.currentStock }, { currentStock: { gte: item.quantity } }] }, data: { currentStock: roundQuantity(product.currentStock - item.quantity) } });
      if (updated.count !== 1) throw Object.assign(new Error("Supply stock changed before this production batch was saved"), { status: 409 });
      await tx.stockMovement.create({ data: { type: "OUT", quantity: item.quantity, note: `Farm production #${created.id.slice(-6)}`, productId: item.productId } });
    }
    const outputProduct = productMap.get(outputProductId);
    const weightedCost = weightedAverageCost({ currentQuantity: outputProduct.currentStock, currentUnitCost: outputProduct.buyingPrice, addedQuantity: usableYield, addedTotalCost: costs.totalCost });
    const afterProductionQuantity = roundQuantity(outputProduct.currentStock + usableYield);
    const outputUpdated = await tx.product.updateMany({
      where: { id: outputProductId, shopId, currentStock: outputProduct.currentStock, buyingPrice: outputProduct.buyingPrice },
      data: { currentStock: afterProductionQuantity, buyingPrice: weightedCost },
    });
    if (outputUpdated.count !== 1) throw Object.assign(new Error("Output stock changed before production was saved. Refresh and retry."), { status: 409 });
    await tx.stockMovement.create({ data: { type: "IN", quantity: usableYield, note: `Farm production #${created.id.slice(-6)}${costs.wasteQuantity || brokenQuantity ? `; loss ${costs.wasteQuantity + brokenQuantity}` : ""}`, productId: outputProductId } });
    if (eggStockMode === "TRAYS") {
      const fullTrays = Math.floor(usableYield / 30);
      if (fullTrays > 0) {
        const packedEggs = fullTrays * 30;
        const remainingEggs = roundQuantity(afterProductionQuantity - packedEggs);
        const eggUpdated = await tx.product.updateMany({ where: { id: outputProductId, shopId, currentStock: afterProductionQuantity, buyingPrice: weightedCost }, data: { currentStock: remainingEggs } });
        if (eggUpdated.count !== 1) throw Object.assign(new Error("Egg stock changed during tray packing. Refresh and retry."), { status: 409 });
        const trayProduct = productMap.get(trayProductId);
        const totalPackedCost = weightedCost * packedEggs;
        const trayUnitCost = weightedAverageCost({ currentQuantity: trayProduct.currentStock, currentUnitCost: trayProduct.buyingPrice, addedQuantity: fullTrays, addedTotalCost: totalPackedCost });
        const trayUpdated = await tx.product.updateMany({ where: { id: trayProductId, shopId, currentStock: trayProduct.currentStock, buyingPrice: trayProduct.buyingPrice }, data: { currentStock: roundQuantity(trayProduct.currentStock + fullTrays), buyingPrice: trayUnitCost } });
        if (trayUpdated.count !== 1) throw Object.assign(new Error("Tray stock changed during packing. Refresh and retry."), { status: 409 });
        const conversion = await tx.farmPackConversion.create({ data: { shopId, inputProductId: outputProductId, outputProductId: trayProductId, inputQuantity: packedEggs, outputQuantity: fullTrays, totalCost: totalPackedCost, unitCost: Math.round(totalPackedCost / fullTrays), note: "Packed during egg production", convertedAt: producedAt, convertedBy: req.user.staffId || req.user.userId, farmProductionId: created.id } });
        await tx.stockMovement.create({ data: { type: "OUT", quantity: packedEggs, note: `Farm packing #${conversion.id.slice(-6)}`, productId: outputProductId } });
        await tx.stockMovement.create({ data: { type: "IN", quantity: fullTrays, note: `Farm packing #${conversion.id.slice(-6)}`, productId: trayProductId } });
      }
    }
    if (type === "EGGS" && !req.user.staffId) {
      await tx.farmSettings.upsert({ where: { shopId }, create: { shopId, hasLivestock: true, preferredEggStockMode: eggStockMode }, update: { preferredEggStockMode: eggStockMode } });
    }
    return tx.farmProductionBatch.findUnique({ where: { id: created.id }, include: batchInclude() });
    });
  } catch (error) {
    if (!requestId || error?.code !== "P2002") throw error;
    batch = await prisma.farmProductionBatch.findUnique({ where: { shopId_clientRequestId: { shopId, clientRequestId: requestId } }, include: batchInclude() });
    if (!batch) throw error;
    reused = true;
  }
  req.audit = { action: reused ? "farm.production.reused" : "farm.production.create", resourceType: "farm_production_batch", resourceId: batch.id, metadata: { groupId, outputProductId, trayProductId: trayProductId || null, type, eggStockMode, actualYield, brokenQuantity, wasteQuantity: batch.wasteQuantity, paymentMethod, cashSessionId: batch.cashSessionId || null } };
  res.status(reused ? 200 : 201).json({ batch: redactBatch(batch, req), reused });
});

const packOutput = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const inputProductId = String(req.body.inputProductId || "").trim();
  const outputProductId = String(req.body.outputProductId || "").trim();
  const inputQuantity = Number(req.body.inputQuantity);
  const outputQuantity = Number(req.body.outputQuantity);
  const convertedAt = parseDate(req.body.convertedAt);
  const note = shortText(req.body.note, 500);
  const requestId = clientRequestId(req.body.clientRequestId);
  if (req.body.clientRequestId && !requestId) return res.status(400).json({ error: "Invalid livestock retry key" });
  if (!inputProductId || !outputProductId || inputProductId === outputProductId || !Number.isInteger(inputQuantity) || inputQuantity <= 0 || !Number.isInteger(outputQuantity) || outputQuantity <= 0 || !convertedAt) {
    return res.status(400).json({ error: "Choose different input and packed products, whole quantities, and a valid date" });
  }

  let reused = false;
  let conversion;
  try {
    conversion = await prisma.$transaction(async (tx) => {
    if (requestId) {
      const existing = await tx.farmPackConversion.findUnique({ where: { shopId_clientRequestId: { shopId, clientRequestId: requestId } }, include: { inputProduct: { select: { id: true, name: true, unit: true } }, outputProduct: { select: { id: true, name: true, unit: true } } } });
      if (existing) { reused = true; return existing; }
    }
    const products = await tx.product.findMany({ where: { shopId, isActive: true, id: { in: [inputProductId, outputProductId] } }, include: { livestockGroup: { select: { id: true } } } });
    if (products.length !== 2) throw Object.assign(new Error("Choose products that belong to this farm"), { status: 400 });
    const input = products.find((product) => product.id === inputProductId);
    const output = products.find((product) => product.id === outputProductId);
    if (input.livestockGroup || output.livestockGroup) throw Object.assign(new Error("Live-animal products cannot be used in stock packing"), { status: 400 });
    if (input.currentStock < inputQuantity) throw Object.assign(new Error(`Insufficient stock for ${input.name}`), { status: 409 });
    const totalCost = input.buyingPrice * inputQuantity;
    const unitCost = Math.round(totalCost / outputQuantity);
    const updated = await tx.product.updateMany({ where: { id: inputProductId, shopId, currentStock: { gte: inputQuantity } }, data: { currentStock: { decrement: inputQuantity } } });
    if (updated.count !== 1) throw Object.assign(new Error("Input stock changed before packaging"), { status: 409 });
    const created = await tx.farmPackConversion.create({ data: { shopId, inputProductId, outputProductId, inputQuantity, outputQuantity, totalCost, unitCost, note, convertedAt, convertedBy: req.user.staffId || req.user.userId, clientRequestId: requestId } });
    const weightedCost = weightedAverageCost({ currentQuantity: output.currentStock, currentUnitCost: output.buyingPrice, addedQuantity: outputQuantity, addedTotalCost: totalCost });
    const outputUpdated = await tx.product.updateMany({
      where: { id: outputProductId, shopId, currentStock: output.currentStock, buyingPrice: output.buyingPrice },
      data: { currentStock: { increment: outputQuantity }, buyingPrice: weightedCost },
    });
    if (outputUpdated.count !== 1) throw Object.assign(new Error("Packed product stock changed before conversion was saved. Refresh and retry."), { status: 409 });
    await tx.stockMovement.create({ data: { type: "OUT", quantity: inputQuantity, note: `Farm packing #${created.id.slice(-6)}`, productId: inputProductId } });
    await tx.stockMovement.create({ data: { type: "IN", quantity: outputQuantity, note: `Farm packing #${created.id.slice(-6)}`, productId: outputProductId } });
    return tx.farmPackConversion.findUnique({ where: { id: created.id }, include: { inputProduct: { select: { id: true, name: true, unit: true } }, outputProduct: { select: { id: true, name: true, unit: true } } } });
    });
  } catch (error) {
    if (!requestId || error?.code !== "P2002") throw error;
    conversion = await prisma.farmPackConversion.findUnique({ where: { shopId_clientRequestId: { shopId, clientRequestId: requestId } }, include: { inputProduct: { select: { id: true, name: true, unit: true } }, outputProduct: { select: { id: true, name: true, unit: true } } } });
    if (!conversion) throw error;
    reused = true;
  }
  req.audit = { action: reused ? "farm.pack.reused" : "farm.pack.create", resourceType: "farm_pack_conversion", resourceId: conversion.id, metadata: { inputProductId, outputProductId, inputQuantity, outputQuantity } };
  res.status(reused ? 200 : 201).json({ conversion: redactConversion(conversion, req), reused });
});

module.exports = { overview, listProducts, saveConfiguration, saveProfiles, createGroup, setLiveProduct, recordAnimalEvent, createProduction, packOutput, costsFor, redactBatch, redactConversion };
