const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { inferBarcodeType, validateBarcode, nextInternalBarcode } = require("../lib/barcode");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch((error) => {
    if (error?.code === "P2002" && Array.isArray(error?.meta?.target) && error.meta.target.includes("barcode")) {
      req.audit = { action: "barcode.duplicate_attempt", resourceType: "product", metadata: { shopId: req.user?.shopId || null } };
      return res.status(409).json({ error: "This barcode is already used by another product." });
    }
    return next(error);
  });
}

function canViewFinancials(req) {
  return req.user.role === "ADMIN" || !req.user.staffId || req.user.permissions?.canViewReports;
}

function canGenerateBarcode(req) {
  return req.user.role === "ADMIN" || !req.user.staffId || req.user.staffRole === "MANAGER";
}

function redactProduct(product, req) {
  return canViewFinancials(req) ? product : { ...product, buyingPrice: null };
}

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { lowStock, search, page = 1, limit = 50 } = req.query;
  const pageNumber = Number(page);
  const limitNumber = Number(limit);
  const skip = (pageNumber - 1) * limitNumber;

  const where = { shopId, isActive: true };
  if (search) where.OR = [
    { name: { contains: search, mode: "insensitive" } },
    { sku: { contains: search, mode: "insensitive" } },
    { barcode: { contains: String(search).trim().toUpperCase() } },
  ];

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
    products: result.map((product) => redactProduct(product, req)),
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
  res.json({ product: redactProduct(product, req) });
});

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { name, sku, unit, buyingPrice, sellingPrice, wholesalePrice, wholesaleMinQty, currentStock, minimumStock, supplierId, expiryDate, doesNotExpire, barcode: rawBarcode, barcodeType, generateBarcode } = req.body;

  if (!name || buyingPrice == null || sellingPrice == null) {
    return res.status(400).json({ error: "name, buyingPrice, and sellingPrice are required" });
  }
  const initialStock = currentStock === undefined || currentStock === "" ? 0 : Number(currentStock);
  if (!Number.isInteger(initialStock) || initialStock < 0) {
    return res.status(400).json({ error: "Current stock must be a whole number 0 or greater" });
  }
  const retailPrice = Number(sellingPrice);
  const parsedWholesalePrice = wholesalePrice != null && wholesalePrice !== "" ? Number(wholesalePrice) : null;
  if (parsedWholesalePrice != null && parsedWholesalePrice > retailPrice) {
    return res.status(400).json({ error: "Wholesale price cannot be higher than the retail selling price" });
  }

  const checked = validateBarcode(rawBarcode);
  if (checked.error) return res.status(400).json({ error: checked.error });
  if (generateBarcode && !canGenerateBarcode(req)) return res.status(403).json({ error: "Only an admin or manager can generate barcodes" });
  if (generateBarcode) {
    const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { barcodeGenerationEnabled: true } });
    if (shop?.barcodeGenerationEnabled === false) return res.status(403).json({ error: "Barcode generation is disabled in settings" });
  }
  const product = await prisma.$transaction(async (tx) => {
    const barcode = generateBarcode ? await nextInternalBarcode(tx) : checked.value;
    if (barcode) {
      const duplicate = await tx.product.findUnique({ where: { barcode }, select: { id: true } });
      if (duplicate) throw Object.assign(new Error("This barcode is already used by another product."), { status: 409, code: "BARCODE_DUPLICATE" });
    }
    const created = await tx.product.create({
      data: {
      name,
      sku,
      unit: unit || "pcs",
      buyingPrice: Number(buyingPrice),
      sellingPrice: retailPrice,
      wholesalePrice: parsedWholesalePrice,
      wholesaleMinQty: wholesaleMinQty != null && wholesaleMinQty !== "" ? Number(wholesaleMinQty) : null,
      currentStock: initialStock,
      minimumStock: minimumStock === undefined || minimumStock === "" ? 5 : Number(minimumStock),
      shopId,
      supplierId: supplierId || null,
      doesNotExpire: Boolean(doesNotExpire),
      expiryDate: doesNotExpire ? null : (expiryDate ? new Date(expiryDate) : null),
      barcode,
      barcodeType: barcode ? inferBarcodeType(barcode, generateBarcode ? "INTERNAL" : barcodeType) : null,
      barcodeGenerated: Boolean(generateBarcode),
      barcodeCreatedAt: barcode ? new Date() : null,
      barcodeUpdatedAt: barcode ? new Date() : null,
    },
      include: { supplier: { select: { id: true, name: true, phone: true } } },
    });

    // The product and its opening balance must commit together.
    if (created.currentStock > 0) {
      await tx.stockMovement.create({
        data: {
          type: "IN",
          quantity: created.currentStock,
          note: "Initial stock",
          productId: created.id,
        },
      });
    }
    return created;
  });

  res.status(201).json({ product: redactProduct(product, req) });
});

const update = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, shopId } });
  if (!existing) return res.status(404).json({ error: "Product not found" });

  const { name, sku, unit, buyingPrice, sellingPrice, wholesalePrice, wholesaleMinQty, minimumStock, supplierId, isActive, expiryDate, doesNotExpire, barcode: rawBarcode, barcodeType, generateBarcode } = req.body;
  const nextSellingPrice = sellingPrice === undefined ? existing.sellingPrice : Number(sellingPrice);
  const nextWholesalePrice = wholesalePrice === undefined
    ? existing.wholesalePrice
    : wholesalePrice === null || wholesalePrice === "" ? null : Number(wholesalePrice);
  if (nextWholesalePrice != null && nextWholesalePrice > nextSellingPrice) {
    return res.status(400).json({ error: "Wholesale price cannot be higher than the retail selling price" });
  }

  const checked = rawBarcode === undefined ? { value: undefined } : validateBarcode(rawBarcode);
  if (checked.error) return res.status(400).json({ error: checked.error });
  if (generateBarcode && !canGenerateBarcode(req)) return res.status(403).json({ error: "Only an admin or manager can generate barcodes" });
  if (generateBarcode) {
    const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { barcodeGenerationEnabled: true } });
    if (shop?.barcodeGenerationEnabled === false) return res.status(403).json({ error: "Barcode generation is disabled in settings" });
  }
  let barcode = checked.value;
  if (generateBarcode) barcode = await prisma.$transaction((tx) => nextInternalBarcode(tx));
  if (barcode && barcode !== existing.barcode) {
    const duplicate = await prisma.product.findUnique({ where: { barcode }, select: { id: true } });
    if (duplicate) {
      req.audit = { action: "barcode.duplicate_attempt", resourceType: "product", resourceId: existing.id, metadata: { shopId, barcode } };
      return res.status(409).json({ error: "This barcode is already used by another product." });
    }
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
      ...(barcode !== undefined && {
        barcode,
        barcodeType: barcode ? inferBarcodeType(barcode, generateBarcode ? "INTERNAL" : barcodeType) : null,
        barcodeGenerated: Boolean(generateBarcode) || (barcode === existing.barcode ? existing.barcodeGenerated : false),
        barcodeCreatedAt: barcode && !existing.barcode ? new Date() : existing.barcodeCreatedAt,
        barcodeUpdatedAt: new Date(),
      }),
    },
    include: { supplier: { select: { id: true, name: true, phone: true } } },
  });

  res.json({ product: redactProduct(product, req) });
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
  res.json({ products: products.filter((p) => p.currentStock <= p.minimumStock).map((product) => redactProduct(product, req)) });
});

module.exports = { list, get, create, update, remove, getLowStock };
