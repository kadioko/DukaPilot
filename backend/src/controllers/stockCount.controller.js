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
    return tx.stockCount.create({ data: { shopId, createdById: req.user.userId, items: { create: products.map((product) => ({ productId: product.id, expected: product.currentStock })) } }, include: { items: { include: { product: { select: { id: true, name: true, barcode: true, unit: true } } } } });
  });
  res.status(201).json({ count });
});

const get = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user); const count = await ownedCount(req.params.id, shopId);
  if (!count) return res.status(404).json({ error: "Stock count not found" }); res.json({ count });
});

const scan = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user); const barcode = String(req.body.barcode || "").trim().toUpperCase();
  const count = await prisma.stockCount.findFirst({ where: { id: req.params.id, shopId, status: "OPEN" } });
  if (!count) return res.status(404).json({ error: "Open stock count not found" });
  const product = await prisma.product.findFirst({ where: { shopId, barcode, isActive: true } });
  await prisma.barcodeScan.create({ data: { shopId, barcode, productId: product?.id || null, found: Boolean(product), context: "STOCK_COUNT" } });
  if (!product) return res.status(404).json({ error: "This barcode was not found." });
  const item = await prisma.stockCountItem.update({ where: { stockCountId_productId: { stockCountId: count.id, productId: product.id } }, data: { counted: { increment: 1 } }, include: { product: { select: { id: true, name: true, barcode: true, unit: true } } } });
  res.json({ item });
});

const finish = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user); const count = await ownedCount(req.params.id, shopId);
  if (!count || count.status !== "OPEN") return res.status(404).json({ error: "Open stock count not found" });
  const adjust = Boolean(req.body.applyAdjustments);
  await prisma.$transaction(async (tx) => {
    if (adjust) for (const item of count.items) {
      if (item.counted === item.expected) continue;
      await tx.product.update({ where: { id: item.productId }, data: { currentStock: item.counted } });
      await tx.stockMovement.create({ data: { type: "ADJUSTMENT", quantity: item.counted, note: `Stock count ${count.id}`, productId: item.productId } });
    }
    await tx.stockCount.update({ where: { id: count.id }, data: { status: "COMPLETED", completedAt: new Date() } });
  });
  res.json({ count: await ownedCount(count.id, shopId) });
});

module.exports = { create, get, scan, finish };
