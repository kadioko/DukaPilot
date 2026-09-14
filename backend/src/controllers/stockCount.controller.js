const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");

function asyncHandler(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }

async function ownedCount(id, shopId) {
  return prisma.stockCount.findFirst({ where: { id, shopId }, include: { items: { include: { product: { select: { id: true, name: true, barcode: true, unit: true, currentStock: true } } }, orderBy: { product: { name: "asc" } } } } });
}

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const count = await prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({ where: { shopId, isActive: true }, select: { id: true, currentStock: true } });
    return tx.stockCount.create({
      data: {
        shopId,
        createdById: req.user.userId,
        items: { create: products.map((product) => ({ productId: product.id, expected: product.currentStock })) },
      },
      include: { items: { include: { product: { select: { id: true, name: true, barcode: true, unit: true } } } } },
    });
  });
  res.status(201).json({ count });
});

const get = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user); const count = await ownedCount(req.params.id, shopId);
  if (!count) return res.status(404).json({ error: "Stock count not found" }); res.json({ count });
});

const scan = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user); const barcode = String(req.body.barcode || "").trim().toUpperCase();
  try {
    const item = await prisma.$transaction(async (tx) => {
      const count = await tx.stockCount.findFirst({ where: { id: req.params.id, shopId, status: "OPEN" } });
      if (!count) throw Object.assign(new Error("Open stock count not found"), { status: 404 });
      const product = await tx.product.findFirst({ where: { shopId, barcode, isActive: true } });
      await tx.barcodeScan.create({ data: { shopId, barcode, productId: product?.id || null, found: Boolean(product), context: "STOCK_COUNT" } });
      if (!product) throw Object.assign(new Error("This barcode was not found."), { status: 404 });
      return tx.stockCountItem.update({ where: { stockCountId_productId: { stockCountId: count.id, productId: product.id } }, data: { counted: { increment: 1 } }, include: { product: { select: { id: true, name: true, barcode: true, unit: true } } } });
    }, { isolationLevel: "Serializable" });
    res.json({ item });
  } catch (error) {
    if (error?.code === "P2034") throw Object.assign(new Error("This stock count is being completed. Refresh before scanning again."), { status: 409 });
    throw error;
  }
});

const finish = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const adjust = Boolean(req.body.applyAdjustments);
  const countId = req.params.id;
  try {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.stockCount.updateMany({
        where: { id: countId, shopId, status: "OPEN" },
        data: { status: "FINALIZING" },
      });
      if (claimed.count !== 1) {
        throw Object.assign(new Error("This stock count was already completed or changed. Refresh and try again."), { status: 409 });
      }
      const count = await tx.stockCount.findUnique({
        where: { id: countId },
        include: { items: true },
      });
      if (!count) throw Object.assign(new Error("Stock count not found"), { status: 404 });
      if (adjust) for (const item of count.items) {
        if (item.counted === item.expected) continue;
        const updated = await tx.product.updateMany({
          where: { id: item.productId, shopId, isActive: true, currentStock: item.expected },
          data: { currentStock: item.counted },
        });
        if (updated.count !== 1) {
          throw Object.assign(new Error("Stock changed while this count was open. Refresh the inventory and start a new count."), { status: 409 });
        }
        await tx.stockMovement.create({ data: { type: "ADJUSTMENT", quantity: item.counted, note: `Stock count ${count.id}: ${item.expected} to ${item.counted}`, productId: item.productId } });
      }
      await tx.stockCount.updateMany({ where: { id: countId, shopId, status: "FINALIZING" }, data: { status: "COMPLETED", completedAt: new Date() } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error?.code === "P2034") throw Object.assign(new Error("Stock changed while this count was being completed. Refresh and start a new count."), { status: 409 });
    throw error;
  }
  res.json({ count: await ownedCount(countId, shopId) });
});

module.exports = { create, get, scan, finish };
