const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");

function tanzaniaDayStart(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const [year, month, day] = value.split("-").map(Number);
  const utcDay = Date.UTC(year, month - 1, day);
  const date = new Date(utcDay);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return new Date(utcDay - 3 * 60 * 60 * 1000);
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function roundQuantity(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000) / 1000;
}

const adjust = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { productId, type, quantity, note } = req.body;

  const qty = Number(quantity);
  const normalizedType = String(type).toUpperCase();
  if (!Number.isFinite(qty) || Math.abs(qty - Math.round(qty * 1000) / 1000) > 1e-9 || qty < 0 || (normalizedType !== "ADJUSTMENT" && qty === 0)) {
    return res.status(400).json({ error: "Quantity must be a non-negative number with at most 3 decimal places" });
  }
  const normalizedQuantity = Math.round(qty * 1000) / 1000;
  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: productId, shopId, isActive: true } });
    if (!product) throw Object.assign(new Error("Product not found"), { status: 404 });

    const where = { id: productId, shopId, isActive: true, currentStock: product.currentStock };
    let data;
    if (normalizedType === "IN") data = { currentStock: roundQuantity(product.currentStock + normalizedQuantity) };
    else if (normalizedType === "OUT") {
      where.AND = [{ currentStock: product.currentStock }, { currentStock: { gte: normalizedQuantity } }];
      delete where.currentStock;
      data = { currentStock: roundQuantity(product.currentStock - normalizedQuantity) };
    } else {
      data = { currentStock: normalizedQuantity };
    }

    const updated = await tx.product.updateMany({ where, data });
    if (updated.count !== 1) {
      throw Object.assign(new Error(normalizedType === "OUT" ? "Insufficient stock" : "Stock changed on another device. Refresh and try again."), { status: 409 });
    }
    const movement = await tx.stockMovement.create({
      data: {
        type: normalizedType,
        quantity: normalizedQuantity,
        note: note || null,
        productId,
      },
    });
    const updatedProduct = await tx.product.findUnique({ where: { id: productId } });
    return { movement, updatedProduct };
  });

  res.json({ product: result.updatedProduct, movement: result.movement });
});

const movements = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { productId } = req.params;

  const product = await prisma.product.findFirst({ where: { id: productId, shopId } });
  if (!product) return res.status(404).json({ error: "Product not found" });

  const stockMovements = await prisma.stockMovement.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.json({ product: { id: product.id, name: product.name }, movements: stockMovements });
});

const history = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
  const search = String(req.query.search || "").trim().slice(0, 100);
  const type = String(req.query.type || "ALL").toUpperCase();
  if (!["ALL", "IN", "OUT", "ADJUSTMENT"].includes(type)) {
    return res.status(400).json({ error: "Invalid stock movement type" });
  }

  const where = { product: { is: { shopId } } };
  if (type !== "ALL") where.type = type;
  if (req.query.productId) where.productId = String(req.query.productId);
  if (req.query.from || req.query.to) {
    const from = req.query.from ? tanzaniaDayStart(String(req.query.from)) : null;
    const toStart = req.query.to ? tanzaniaDayStart(String(req.query.to)) : null;
    if ((req.query.from && !from) || (req.query.to && !toStart)) {
      return res.status(400).json({ error: "Dates must be valid YYYY-MM-DD values" });
    }
    if (from && toStart && from > toStart) return res.status(400).json({ error: "Start date must be on or before end date" });
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (toStart) where.createdAt.lt = new Date(toStart.getTime() + 24 * 60 * 60 * 1000);
  }
  if (search) {
    where.AND = [{ OR: [
      { note: { contains: search, mode: "insensitive" } },
      { product: { is: { name: { contains: search, mode: "insensitive" } } } },
      { product: { is: { sku: { contains: search, mode: "insensitive" } } } },
    ] }];
  }

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true, unit: true, currentStock: true } },
        stockReceipt: { select: { id: true, invoiceNumber: true, supplier: { select: { id: true, name: true } } } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.stockMovement.count({ where }),
  ]);

  res.json({ movements, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

module.exports = { adjust, movements, history };
