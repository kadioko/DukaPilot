const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { findOpenCashSession } = require("../lib/cashSession");

const PROFILE_TYPES = new Set(["LAYERS", "BROILERS", "DAIRY", "BEEF", "GOATS_SHEEP", "PIGS", "MIXED"]);
const EVENT_TYPES = new Set(["ADDITION", "MORTALITY", "CULL"]);
const PRODUCTION_TYPES = new Set(["EGGS", "MILK", "HARVEST", "OTHER"]);
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

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const seen = new Set();
  const items = rawItems.map((item) => ({
    productId: String(item.productId || "").trim(),
    quantity: Number(item.quantity),
  }));
  if (items.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0)) return null;
  if (items.some((item) => seen.has(item.productId) || !seen.add(item.productId))) return null;
  return items;
}

function costsFor(items, additionalCost, actualYield, expectedYield) {
  const ingredientCost = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const totalCost = ingredientCost + additionalCost;
  return {
    ingredientCost,
    totalCost,
    unitCost: Math.round(totalCost / actualYield),
    wasteQuantity: Math.max(0, expectedYield - actualYield),
  };
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
  };
}

const overview = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12));
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [profiles, groups, batches, totalBatches, recentConversions, production, losses] = await Promise.all([
    prisma.farmProfile.findMany({ where: { shopId }, orderBy: { type: "asc" } }),
    prisma.farmGroup.findMany({ where: { shopId }, orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }], take: 100 }),
    prisma.farmProductionBatch.findMany({ where: { shopId }, include: batchInclude(), orderBy: { producedAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.farmProductionBatch.count({ where: { shopId } }),
    prisma.farmPackConversion.findMany({
      where: { shopId },
      include: { inputProduct: { select: { id: true, name: true, unit: true } }, outputProduct: { select: { id: true, name: true, unit: true } } },
      orderBy: { convertedAt: "desc" },
      take: 8,
    }),
    prisma.farmProductionBatch.aggregate({ where: { shopId, producedAt: { gte: since } }, _sum: { actualYield: true, wasteQuantity: true, totalCost: true }, _count: { id: true } }),
    prisma.farmAnimalEvent.aggregate({ where: { group: { shopId }, type: { in: ["MORTALITY", "CULL"] }, occurredAt: { gte: since } }, _sum: { quantity: true } }),
  ]);

  res.json({
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
      outputQuantity: production._sum.actualYield || 0,
      wasteQuantity: production._sum.wasteQuantity || 0,
      lossAnimals: losses._sum.quantity || 0,
      ...(canViewFinancials(req) ? { productionCost: production._sum.totalCost || 0 } : {}),
    },
  });
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

const recordAnimalEvent = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const type = String(req.body.type || "").toUpperCase();
  const quantity = Number(req.body.quantity);
  const occurredAt = parseDate(req.body.occurredAt);
  const note = shortText(req.body.note, 1000);
  if (!EVENT_TYPES.has(type) || !Number.isInteger(quantity) || quantity <= 0 || !occurredAt) return res.status(400).json({ error: "Choose a valid event, whole quantity, and date" });

  const result = await prisma.$transaction(async (tx) => {
    const group = await tx.farmGroup.findFirst({ where: { id: req.params.id, shopId }, select: { id: true, currentAnimals: true } });
    if (!group) throw Object.assign(new Error("Farm group not found"), { status: 404 });
    const decrement = type === "MORTALITY" || type === "CULL";
    if (decrement) {
      const updated = await tx.farmGroup.updateMany({ where: { id: group.id, shopId, currentAnimals: { gte: quantity } }, data: { currentAnimals: { decrement: quantity } } });
      if (updated.count !== 1) throw Object.assign(new Error("This event would reduce the group below zero animals"), { status: 409 });
    } else {
      await tx.farmGroup.update({ where: { id: group.id }, data: { currentAnimals: { increment: quantity } } });
    }
    const event = await tx.farmAnimalEvent.create({ data: { groupId: group.id, type, quantity, occurredAt, note, recordedBy: req.user.staffId || req.user.userId } });
    const updatedGroup = await tx.farmGroup.findUnique({ where: { id: group.id } });
    return { event, group: updatedGroup };
  });
  req.audit = { action: "farm.animal_event.create", resourceType: "farm_group", resourceId: req.params.id, metadata: { type, quantity } };
  res.status(201).json(result);
});

const createProduction = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const groupId = String(req.body.groupId || "").trim();
  const outputProductId = String(req.body.outputProductId || "").trim();
  const type = String(req.body.type || "OTHER").toUpperCase();
  const expectedYield = Number(req.body.expectedYield);
  const actualYield = Number(req.body.actualYield);
  const additionalCost = Number(req.body.additionalCost || 0);
  const paymentMethod = String(req.body.paymentMethod || "CASH").toUpperCase();
  const producedAt = parseDate(req.body.producedAt);
  const additionalCostNote = shortText(req.body.additionalCostNote, 500);
  const note = shortText(req.body.note, 1000);
  const requestedItems = normalizeItems(req.body.items);
  if (!groupId || !outputProductId || !PRODUCTION_TYPES.has(type) || !Number.isInteger(expectedYield) || expectedYield <= 0 || !Number.isInteger(actualYield) || actualYield <= 0 || !Number.isInteger(additionalCost) || additionalCost < 0 || !PAYMENT_METHODS.has(paymentMethod) || !producedAt || requestedItems === null) {
    return res.status(400).json({ error: "Choose a group, output, valid yields, costs, payment method, date, and valid supplies" });
  }
  if (!requestedItems.length && additionalCost === 0) return res.status(400).json({ error: "Add supplies used or a direct production cost so the output cost is meaningful" });

  const batch = await prisma.$transaction(async (tx) => {
    const group = await tx.farmGroup.findFirst({ where: { id: groupId, shopId, isActive: true }, select: { id: true, profileType: true } });
    if (!group) throw Object.assign(new Error("Active farm group not found"), { status: 404 });
    const productIds = [outputProductId, ...requestedItems.map((item) => item.productId)];
    if (new Set(productIds).size !== productIds.length) throw Object.assign(new Error("The output product cannot also be a supply"), { status: 400 });
    const products = await tx.product.findMany({ where: { shopId, isActive: true, id: { in: productIds } } });
    if (products.length !== productIds.length) throw Object.assign(new Error("One or more products do not belong to this farm"), { status: 400 });
    const productMap = new Map(products.map((product) => [product.id, product]));
    for (const item of requestedItems) {
      const product = productMap.get(item.productId);
      if (product.currentStock < item.quantity) throw Object.assign(new Error(`Insufficient supply stock for ${product.name}`), { status: 409 });
    }
    const costItems = requestedItems.map((item) => ({ ...item, unitCost: productMap.get(item.productId).buyingPrice }));
    const costs = costsFor(costItems, additionalCost, actualYield, expectedYield);
    const cashSession = additionalCost > 0 && paymentMethod === "CASH" ? await findOpenCashSession(tx, shopId, req.user) : null;
    const created = await tx.farmProductionBatch.create({
      data: {
        shopId, groupId, outputProductId, type, expectedYield, actualYield, wasteQuantity: costs.wasteQuantity,
        ingredientCost: costs.ingredientCost, additionalCost, totalCost: costs.totalCost, unitCost: costs.unitCost,
        additionalCostNote, paymentMethod, cashSessionId: cashSession?.id || null, note, producedAt, producedBy: req.user.staffId || req.user.userId,
        items: { create: costItems.map((item) => ({ productId: item.productId, quantity: item.quantity, unitCost: item.unitCost, totalCost: item.quantity * item.unitCost })) },
      },
    });
    for (const item of requestedItems) {
      const updated = await tx.product.updateMany({ where: { id: item.productId, shopId, currentStock: { gte: item.quantity } }, data: { currentStock: { decrement: item.quantity } } });
      if (updated.count !== 1) throw Object.assign(new Error("Supply stock changed before this production batch was saved"), { status: 409 });
      await tx.stockMovement.create({ data: { type: "OUT", quantity: item.quantity, note: `Farm production #${created.id.slice(-6)}`, productId: item.productId } });
    }
    await tx.product.update({ where: { id: outputProductId }, data: { currentStock: { increment: actualYield }, buyingPrice: costs.unitCost } });
    await tx.stockMovement.create({ data: { type: "IN", quantity: actualYield, note: `Farm production #${created.id.slice(-6)}${costs.wasteQuantity ? `; loss ${costs.wasteQuantity}` : ""}`, productId: outputProductId } });
    return tx.farmProductionBatch.findUnique({ where: { id: created.id }, include: batchInclude() });
  });
  req.audit = { action: "farm.production.create", resourceType: "farm_production_batch", resourceId: batch.id, metadata: { groupId, outputProductId, type, actualYield, wasteQuantity: batch.wasteQuantity, paymentMethod, cashSessionId: batch.cashSessionId || null } };
  res.status(201).json({ batch: redactBatch(batch, req) });
});

const packOutput = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const inputProductId = String(req.body.inputProductId || "").trim();
  const outputProductId = String(req.body.outputProductId || "").trim();
  const inputQuantity = Number(req.body.inputQuantity);
  const outputQuantity = Number(req.body.outputQuantity);
  const convertedAt = parseDate(req.body.convertedAt);
  const note = shortText(req.body.note, 500);
  if (!inputProductId || !outputProductId || inputProductId === outputProductId || !Number.isInteger(inputQuantity) || inputQuantity <= 0 || !Number.isInteger(outputQuantity) || outputQuantity <= 0 || !convertedAt) {
    return res.status(400).json({ error: "Choose different input and packed products, whole quantities, and a valid date" });
  }

  const conversion = await prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({ where: { shopId, isActive: true, id: { in: [inputProductId, outputProductId] } } });
    if (products.length !== 2) throw Object.assign(new Error("Choose products that belong to this farm"), { status: 400 });
    const input = products.find((product) => product.id === inputProductId);
    if (input.currentStock < inputQuantity) throw Object.assign(new Error(`Insufficient stock for ${input.name}`), { status: 409 });
    const totalCost = input.buyingPrice * inputQuantity;
    const unitCost = Math.round(totalCost / outputQuantity);
    const updated = await tx.product.updateMany({ where: { id: inputProductId, shopId, currentStock: { gte: inputQuantity } }, data: { currentStock: { decrement: inputQuantity } } });
    if (updated.count !== 1) throw Object.assign(new Error("Input stock changed before packaging"), { status: 409 });
    const created = await tx.farmPackConversion.create({ data: { shopId, inputProductId, outputProductId, inputQuantity, outputQuantity, totalCost, unitCost, note, convertedAt, convertedBy: req.user.staffId || req.user.userId } });
    await tx.product.update({ where: { id: outputProductId }, data: { currentStock: { increment: outputQuantity }, buyingPrice: unitCost } });
    await tx.stockMovement.create({ data: { type: "OUT", quantity: inputQuantity, note: `Farm packing #${created.id.slice(-6)}`, productId: inputProductId } });
    await tx.stockMovement.create({ data: { type: "IN", quantity: outputQuantity, note: `Farm packing #${created.id.slice(-6)}`, productId: outputProductId } });
    return tx.farmPackConversion.findUnique({ where: { id: created.id }, include: { inputProduct: { select: { id: true, name: true, unit: true } }, outputProduct: { select: { id: true, name: true, unit: true } } } });
  });
  req.audit = { action: "farm.pack.create", resourceType: "farm_pack_conversion", resourceId: conversion.id, metadata: { inputProductId, outputProductId, inputQuantity, outputQuantity } };
  res.status(201).json({ conversion: redactConversion(conversion, req) });
});

module.exports = { overview, saveProfiles, createGroup, recordAnimalEvent, createProduction, packOutput, costsFor, redactBatch, redactConversion };
