const prisma = require("../lib/prisma");
const { getBillingShopIdForUser } = require("../lib/shopAccess");
const { canUseFeature } = require("../lib/entitlements");
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

const products = wrap(async (req, res) => {
  const rootId = await getBillingShopIdForUser(req.user);
  const shop = await prisma.shop.findFirst({ where: { id: String(req.query.shopId || ""), OR: [{ id: rootId }, { parentShopId: rootId }], branchArchived: false } });
  if (!shop) fail("Branch not found", 404);
  const q = String(req.query.q || "").trim().slice(0, 100);
  res.json({ products: await prisma.product.findMany({ where: { shopId: shop.id, isActive: true, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { barcode: { contains: q } }] } : {}) }, select: { id: true, name: true, unit: true, currentStock: true, barcode: true }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 30 }) });
});

const transfer = wrap(async (req, res) => {
  const rootId = await getBillingShopIdForUser(req.user);
  const { sourceProductId, targetProductId, requestKey } = req.body;
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000000 || typeof sourceProductId !== "string" || typeof targetProductId !== "string" || !/^[a-f0-9-]{36}$/i.test(requestKey || "")) fail("Select two products and a positive whole quantity");
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM shops WHERE id = ${rootId} FOR UPDATE`;
    const prior = await tx.branchTransfer.findUnique({ where: { businessId_requestKey: { businessId: rootId, requestKey } } });
    if (prior) {
      if (prior.sourceProductId !== sourceProductId || prior.targetProductId !== targetProductId || prior.quantity !== quantity) fail("Transfer request does not match", 409);
      return prior;
    }
    const root = await tx.shop.findUnique({ where: { id: rootId } });
    if (!canUseFeature(root, "BRANCHES")) fail("Stock transfers require an active trial or Pro subscription", 403);
    // Lock in stable order so a concurrent sale/restock cannot change cost or quantity mid-transfer.
    await tx.$queryRaw`SELECT id FROM products WHERE id IN (${sourceProductId}, ${targetProductId}) ORDER BY id FOR UPDATE`;
    const items = await tx.product.findMany({ where: { id: { in: [sourceProductId, targetProductId] }, isActive: true, shop: { branchArchived: false, OR: [{ id: rootId }, { parentShopId: rootId }] } } });
    const source = items.find((p) => p.id === sourceProductId), target = items.find((p) => p.id === targetProductId);
    if (!source || !target || source.shopId === target.shopId) fail("Choose products in two different branches of this business", 403);
    if (source.unit !== target.unit) fail("Both products must use the same stock unit");
    if (source.currentStock < quantity) fail("Insufficient source stock", 409);
    if (source.expiryDate && source.expiryDate <= new Date()) fail("Expired stock cannot be transferred");
    if (+source.expiryDate !== +target.expiryDate || source.doesNotExpire !== target.doesNotExpire) fail("Use destination stock with the same expiry date to preserve expiry tracking");
    if (target.currentStock + quantity > 2147483647) fail("Destination stock exceeds the supported quantity");
    const totalQuantity = Number(target.currentStock) + quantity;
    const cost = totalQuantity > 0
      ? Math.round((Number(target.currentStock) * target.buyingPrice + quantity * source.buyingPrice) / totalQuantity)
      : 0;
    const record = await tx.branchTransfer.create({ data: { businessId: rootId, requestKey, sourceShopId: source.shopId, targetShopId: target.shopId, sourceProductId, targetProductId, quantity, unitCost: source.buyingPrice, createdBy: req.user.userId } });
    await tx.product.update({ where: { id: source.id }, data: { currentStock: { decrement: quantity } } });
    await tx.product.update({ where: { id: target.id }, data: { currentStock: { increment: quantity }, buyingPrice: cost } });
    await tx.stockMovement.createMany({ data: [
      { productId: source.id, type: "OUT", quantity, note: `Branch transfer ${record.id} to ${target.shopId}` },
      { productId: target.id, type: "IN", quantity, note: `Branch transfer ${record.id} from ${source.shopId}` },
    ] });
    return record;
  });
  req.audit = { action: "branch.transfer", resourceType: "branchTransfer", resourceId: result.id };
  res.json({ transfer: result });
});
module.exports = { products, transfer };
