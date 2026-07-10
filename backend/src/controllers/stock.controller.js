const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const adjust = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { productId, type, quantity, note } = req.body;

  const qty = Number(quantity);
  const normalizedType = String(type).toUpperCase();
  if (!Number.isInteger(qty) || qty < 0 || (normalizedType !== "ADJUSTMENT" && qty === 0)) {
    return res.status(400).json({ error: "Quantity must be a valid whole number for this adjustment" });
  }
  const result = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: productId, shopId, isActive: true } });
    if (!product) throw Object.assign(new Error("Product not found"), { status: 404 });

    const where = { id: productId, shopId, isActive: true };
    let data;
    if (normalizedType === "IN") data = { currentStock: { increment: qty } };
    else if (normalizedType === "OUT") {
      where.currentStock = { gte: qty };
      data = { currentStock: { decrement: qty } };
    } else {
      where.currentStock = product.currentStock;
      data = { currentStock: qty };
    }

    const updated = await tx.product.updateMany({ where, data });
    if (updated.count !== 1) {
      throw Object.assign(new Error(normalizedType === "OUT" ? "Insufficient stock" : "Stock changed on another device. Refresh and try again."), { status: 409 });
    }
    const movement = await tx.stockMovement.create({
      data: {
        type: normalizedType,
        quantity: qty,
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

module.exports = { adjust, movements };
