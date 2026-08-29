const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function parseDate(value) {
  if (!value) return new Date();
  const text = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00.000Z`) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return null;
  const seen = new Set();
  const items = rawItems.map((item) => ({
    productId: String(item.productId || "").trim(),
    quantity: Number(item.quantity),
  }));
  if (items.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0)) return null;
  if (items.some((item) => seen.has(item.productId) || !seen.add(item.productId))) return null;
  return items;
}

function calculateBatchCosts(items, additionalCost, actualYield, expectedYield) {
  const ingredientCost = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const totalCost = ingredientCost + additionalCost;
  return {
    ingredientCost,
    totalCost,
    unitCost: Math.round(totalCost / actualYield),
    wasteQuantity: Math.max(0, expectedYield - actualYield),
  };
}

function batchInclude() {
  return {
    recipe: { select: { id: true, name: true } },
    outputProduct: { select: { id: true, name: true, unit: true } },
    items: { include: { product: { select: { id: true, name: true, unit: true } } } },
  };
}

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));
  const [batches, total] = await Promise.all([
    prisma.foodPreparationBatch.findMany({
      where: { shopId },
      include: batchInclude(),
      orderBy: { preparedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.foodPreparationBatch.count({ where: { shopId } }),
  ]);
  res.json({ batches, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

const listRecipes = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const recipes = await prisma.foodRecipe.findMany({
    where: { shopId, isActive: true },
    include: {
      outputProduct: { select: { id: true, name: true, unit: true } },
      items: { include: { product: { select: { id: true, name: true, unit: true } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  res.json({ recipes });
});

const createRecipe = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const name = String(req.body.name || "").trim();
  const outputProductId = String(req.body.outputProductId || "").trim();
  const expectedYield = Number(req.body.expectedYield);
  const instructions = String(req.body.instructions || "").trim() || null;
  const items = normalizeItems(req.body.items);
  if (!name || name.length > 120) return res.status(400).json({ error: "Recipe name is required and must be 120 characters or less" });
  if (!outputProductId || !Number.isInteger(expectedYield) || expectedYield <= 0 || !items) return res.status(400).json({ error: "Choose an output product, expected yield, and valid ingredients" });
  if (items.some((item) => item.productId === outputProductId)) return res.status(400).json({ error: "The prepared item cannot also be an ingredient" });

  const recipe = await prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({ where: { shopId, isActive: true, id: { in: [outputProductId, ...items.map((item) => item.productId)] } }, select: { id: true } });
    if (products.length !== items.length + 1) throw Object.assign(new Error("One or more products do not belong to this shop"), { status: 400 });
    return tx.foodRecipe.create({
      data: { name, outputProductId, expectedYield, instructions, shopId, items: { create: items } },
      include: { outputProduct: { select: { id: true, name: true, unit: true } }, items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
    });
  });
  req.audit = { action: "food_recipe.create", resourceType: "food_recipe", resourceId: recipe.id, metadata: { outputProductId, ingredientCount: items.length } };
  res.status(201).json({ recipe });
});

const prepare = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const outputProductId = String(req.body.outputProductId || "").trim();
  const recipeId = String(req.body.recipeId || "").trim() || null;
  const actualYield = Number(req.body.actualYield);
  const requestedExpectedYield = req.body.expectedYield == null || req.body.expectedYield === "" ? null : Number(req.body.expectedYield);
  const additionalCost = Number(req.body.additionalCost || 0);
  const additionalCostNote = String(req.body.additionalCostNote || "").trim() || null;
  const note = String(req.body.note || "").trim() || null;
  const preparedAt = parseDate(req.body.preparedAt);
  const requestedItems = normalizeItems(req.body.items);

  if (!outputProductId || !Number.isInteger(actualYield) || actualYield <= 0 || !Number.isInteger(additionalCost) || additionalCost < 0 || !preparedAt) {
    return res.status(400).json({ error: "Choose an output product, valid yield, preparation cost, and date" });
  }

  const batch = await prisma.$transaction(async (tx) => {
    let ingredients = requestedItems;
    let expectedYield = requestedExpectedYield;
    let recipe = null;
    if (recipeId) {
      recipe = await tx.foodRecipe.findFirst({ where: { id: recipeId, shopId, isActive: true }, include: { items: true } });
      if (!recipe) throw Object.assign(new Error("Recipe not found"), { status: 404 });
      if (recipe.outputProductId !== outputProductId) throw Object.assign(new Error("Recipe output does not match the prepared item"), { status: 400 });
      ingredients = recipe.items.map((item) => ({ productId: item.productId, quantity: item.quantity }));
      expectedYield = recipe.expectedYield;
    }
    if (!ingredients || !Number.isInteger(expectedYield) || expectedYield <= 0) {
      throw Object.assign(new Error("Add ingredients and an expected yield, or choose a recipe"), { status: 400 });
    }
    if (ingredients.some((item) => item.productId === outputProductId)) throw Object.assign(new Error("The prepared item cannot also be an ingredient"), { status: 400 });

    const productIds = [outputProductId, ...ingredients.map((item) => item.productId)];
    const products = await tx.product.findMany({ where: { shopId, isActive: true, id: { in: productIds } } });
    if (products.length !== productIds.length) throw Object.assign(new Error("One or more products do not belong to this shop"), { status: 400 });
    const productMap = new Map(products.map((product) => [product.id, product]));
    for (const item of ingredients) {
      const product = productMap.get(item.productId);
      if (product.currentStock < item.quantity) throw Object.assign(new Error(`Insufficient ingredient stock for ${product.name}. Available: ${product.currentStock} ${product.unit}`), { status: 409 });
    }
    const costItems = ingredients.map((item) => ({ ...item, unitCost: productMap.get(item.productId).buyingPrice }));
    const costs = calculateBatchCosts(costItems, additionalCost, actualYield, expectedYield);
    const created = await tx.foodPreparationBatch.create({
      data: {
        shopId, recipeId, outputProductId, expectedYield, actualYield, wasteQuantity: costs.wasteQuantity,
        ingredientCost: costs.ingredientCost, additionalCost, totalCost: costs.totalCost, unitCost: costs.unitCost,
        additionalCostNote, note, preparedAt, preparedBy: req.user.staffId || req.user.userId,
        items: { create: costItems.map((item) => ({ productId: item.productId, quantity: item.quantity, unitCost: item.unitCost, totalCost: item.quantity * item.unitCost })) },
      },
    });

    for (const item of ingredients) {
      const product = productMap.get(item.productId);
      const updated = await tx.product.updateMany({ where: { id: item.productId, shopId, currentStock: { gte: item.quantity } }, data: { currentStock: { decrement: item.quantity } } });
      if (updated.count !== 1) throw Object.assign(new Error(`Ingredient stock changed before preparation: ${product.name}`), { status: 409 });
      await tx.stockMovement.create({ data: { type: "OUT", quantity: item.quantity, note: `Food preparation #${created.id.slice(-6)}`, productId: item.productId, foodPreparationBatchId: created.id } });
    }
    await tx.product.update({ where: { id: outputProductId }, data: { currentStock: { increment: actualYield }, buyingPrice: costs.unitCost } });
    await tx.stockMovement.create({ data: { type: "IN", quantity: actualYield, note: `Food preparation #${created.id.slice(-6)}${costs.wasteQuantity ? `; waste ${costs.wasteQuantity}` : ""}`, productId: outputProductId, foodPreparationBatchId: created.id } });
    return tx.foodPreparationBatch.findUnique({ where: { id: created.id }, include: batchInclude() });
  });
  req.audit = { action: "food_preparation.create", resourceType: "food_preparation_batch", resourceId: batch.id, metadata: { outputProductId, actualYield: batch.actualYield, wasteQuantity: batch.wasteQuantity, totalCost: batch.totalCost } };
  res.status(201).json({ batch });
});

module.exports = { list, listRecipes, createRecipe, prepare, calculateBatchCosts };
