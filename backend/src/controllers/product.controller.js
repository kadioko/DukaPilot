const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { lowStock, search, page = 1, limit = 50 } = req.query;
  const pageNumber = Number(page);
  const limitNumber = Number(limit);
  const skip = (pageNumber - 1) * limitNumber;

  const where = { shopId, isActive: true };
  if (search) where.name = { contains: search, mode: "insensitive" };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { supplier: { select: { id: true, name: true, phone: true } } },
      orderBy: { name: "asc" },
      skip,
      take: limitNumber,
    }),
    prisma.product.count({ where }),
  ]);

  const result = lowStock === "true"
    ? products.filter((p) => p.currentStock <= p.minimumStock)
    : products;

  res.json({
    products: result,
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages: Math.ceil(total / limitNumber),
    },
  });
});

const get = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, shopId },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      stockMovements: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json({ product });
});

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { name, sku, unit, buyingPrice, sellingPrice, wholesalePrice, wholesaleMinQty, currentStock, minimumStock, supplierId, expiryDate, doesNotExpire } = req.body;

  if (!name || buyingPrice == null || sellingPrice == null) {
    return res.status(400).json({ error: "name, buyingPrice, and sellingPrice are required" });
  }
  const initialStock = currentStock === undefined || currentStock === "" ? 0 : Number(currentStock);
  if (!Number.isFinite(initialStock) || initialStock < 0) {
    return res.status(400).json({ error: "Current stock must be 0 or greater" });
  }
  const retailPrice = Number(sellingPrice);
  const parsedWholesalePrice = wholesalePrice != null && wholesalePrice !== "" ? Number(wholesalePrice) : null;
  if (parsedWholesalePrice != null && parsedWholesalePrice > retailPrice) {
    return res.status(400).json({ error: "Wholesale price cannot be higher than the retail selling price" });
  }

  const product = await prisma.product.create({
    data: {
      name,
      sku,
      unit: unit || "pcs",
      buyingPrice: Number(buyingPrice),
      sellingPrice: retailPrice,
      wholesalePrice: parsedWholesalePrice,
      wholesaleMinQty: wholesaleMinQty != null && wholesaleMinQty !== "" ? Number(wholesaleMinQty) : null,
      currentStock: initialStock,
      minimumStock: Number(minimumStock) || 5,
      shopId,
      supplierId: supplierId || null,
      doesNotExpire: Boolean(doesNotExpire),
      expiryDate: doesNotExpire ? null : (expiryDate ? new Date(expiryDate) : null),
    },
    include: { supplier: { select: { id: true, name: true, phone: true } } },
  });

  // Record initial stock as a stock-in movement
  if (product.currentStock > 0) {
    await prisma.stockMovement.create({
      data: {
        type: "IN",
        quantity: product.currentStock,
        note: "Initial stock",
        productId: product.id,
      },
    });
  }

  res.status(201).json({ product });
});

const update = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, shopId } });
  if (!existing) return res.status(404).json({ error: "Product not found" });

  const { name, sku, unit, buyingPrice, sellingPrice, wholesalePrice, wholesaleMinQty, minimumStock, supplierId, isActive, expiryDate, doesNotExpire } = req.body;
  const nextSellingPrice = sellingPrice === undefined ? existing.sellingPrice : Number(sellingPrice);
  const nextWholesalePrice = wholesalePrice === undefined
    ? existing.wholesalePrice
    : wholesalePrice === null || wholesalePrice === "" ? null : Number(wholesalePrice);
  if (nextWholesalePrice != null && nextWholesalePrice > nextSellingPrice) {
    return res.status(400).json({ error: "Wholesale price cannot be higher than the retail selling price" });
  }

  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(sku !== undefined && { sku }),
      ...(unit !== undefined && { unit }),
      ...(buyingPrice !== undefined && { buyingPrice: Number(buyingPrice) }),
      ...(sellingPrice !== undefined && { sellingPrice: nextSellingPrice }),
      ...(wholesalePrice !== undefined && { wholesalePrice: nextWholesalePrice }),
      ...(wholesaleMinQty !== undefined && { wholesaleMinQty: wholesaleMinQty === null || wholesaleMinQty === "" ? null : Number(wholesaleMinQty) }),
      ...(minimumStock !== undefined && { minimumStock: Number(minimumStock) }),
      ...(supplierId !== undefined && { supplierId }),
      ...(isActive !== undefined && { isActive }),
      ...(doesNotExpire !== undefined && { doesNotExpire: Boolean(doesNotExpire) }),
      ...(doesNotExpire !== undefined && doesNotExpire ? { expiryDate: null } :
          expiryDate !== undefined ? { expiryDate: expiryDate ? new Date(expiryDate) : null } : {}),
    },
    include: { supplier: { select: { id: true, name: true, phone: true } } },
  });

  res.json({ product });
});

const remove = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, shopId } });
  if (!existing) return res.status(404).json({ error: "Product not found" });

  // Soft delete
  await prisma.product.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ message: "Product deactivated" });
});

const getLowStock = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const products = await prisma.product.findMany({
    where: { shopId, isActive: true },
    include: { supplier: { select: { id: true, name: true, phone: true } } },
    orderBy: [{ currentStock: "asc" }, { name: "asc" }],
  });
  res.json({ products: products.filter((p) => p.currentStock <= p.minimumStock) });
});

module.exports = { list, get, create, update, remove, getLowStock };
