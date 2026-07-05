const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const adjust = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { productId, type, quantity, note } = req.body;

  const product = await prisma.product.findFirst({ where: { id: productId, shopId } });
  if (!product) return res.status(404).json({ error: "Product not found" });

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty < 0) {
    return res.status(400).json({ error: "Quantity must be 0 or greater" });
  }
  let newStock = product.currentStock;

  if (type.toUpperCase() === "IN") {
    newStock += qty;
  } else if (type.toUpperCase() === "OUT") {
    if (product.currentStock < qty) {
      return res.status(400).json({ error: "Insufficient stock" });
    }
    newStock -= qty;
  } else {
    // ADJUSTMENT: set absolute value
    newStock = qty;
  }

  const [movement, updatedProduct] = await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        type: type.toUpperCase(),
        quantity: qty,
        note: note || null,
        productId,
      },
    }),
    prisma.product.update({
      where: { id: productId },
      data: { currentStock: newStock },
    }),
  ]);

  res.json({ product: updatedProduct, movement });
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
