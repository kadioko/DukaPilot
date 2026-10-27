const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { redactProduct } = require("../lib/productRedaction");
const { invalidateDashboardHistory } = require("../services/dashboard-cache.service");

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
  const { productId, type, quantity, note, requestKey } = req.body;

  const qty = Number(quantity);
  const normalizedType = String(type).toUpperCase();
  if (!Number.isFinite(qty) || Math.abs(qty - Math.round(qty * 1000) / 1000) > 1e-9 || qty < 0 || (normalizedType !== "ADJUSTMENT" && qty === 0)) {
    return res.status(400).json({ error: "Quantity must be a non-negative number with at most 3 decimal places" });
  }
  const normalizedQuantity = Math.round(qty * 1000) / 1000;
  const normalizedNote = typeof note === "string" ? note.trim() || null : null;
  const requestHash = requestKey ? crypto.createHash("sha256").update(JSON.stringify({
    productId,
    type: normalizedType,
    quantity: normalizedQuantity,
    note: normalizedNote,
  })).digest("hex") : null;

  const findReplay = async (db) => {
    if (!requestKey) return null;
    const movement = await db.stockMovement.findFirst({ where: { productId, requestKey, product: { is: { shopId } } } });
    if (!movement) return null;
    if (movement.requestHash !== requestHash) {
      throw Object.assign(new Error("This stock request key was already used for different details"), { status: 409, code: "IDEMPOTENCY_KEY_REUSED" });
    }
    const currentProduct = await db.product.findUnique({ where: { id: productId } });
    return { movement, updatedProduct: currentProduct, replayed: true };
  };

  let result = await findReplay(prisma);
  if (!result) {
    try {
      result = await prisma.$transaction(async (tx) => {
        const replay = await findReplay(tx);
        if (replay) return replay;
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
            note: normalizedNote,
            productId,
            manualAdjustment: true,
            stockBefore: product.currentStock,
            stockAfter: data.currentStock,
            ...(requestKey ? { requestKey, requestHash } : {}),
          },
        });
        const updatedProduct = await tx.product.findUnique({ where: { id: productId } });
        return { movement, updatedProduct, replayed: false };
      });
    } catch (error) {
      const replay = await findReplay(prisma);
      if (replay) result = replay;
      else throw error;
    }
  }

  res.json({ product: redactProduct(result.updatedProduct, req), movement: result.movement, replayed: result.replayed });
});

const reverseManualMovement = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const movementId = String(req.params.id || "");
  const requestKey = String(req.body.requestKey || "").trim();
  const reason = String(req.body.reason || "").trim();
  if (!/^[a-f0-9-]{16,80}$/i.test(requestKey) || !reason || reason.length > 500) {
    return res.status(400).json({ error: "A retry key and correction reason (up to 500 characters) are required" });
  }
  const requestHash = crypto.createHash("sha256").update(JSON.stringify({ movementId, reason })).digest("hex");
  const replay = async () => prisma.stockMovement.findFirst({ where: { requestKey, reversalOfId: movementId, product: { is: { shopId } } } });
  let reversal = await replay();
  let reused = Boolean(reversal);
  if (reversal && reversal.requestHash !== requestHash) return res.status(409).json({ error: "This retry key was used for different correction details" });
  if (!reversal) {
    try {
      reversal = await prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe('SELECT m."id" FROM "stock_movements" m JOIN products p ON p.id = m."productId" WHERE m.id = $1 AND p."shopId" = $2 FOR UPDATE OF m', movementId, shopId);
        const original = await tx.stockMovement.findFirst({ where: { id: movementId, product: { is: { shopId } } }, include: { reversal: { select: { id: true } } } });
        if (!original) throw Object.assign(new Error("Stock movement not found"), { status: 404 });
        if (!original.manualAdjustment || original.reversalOfId || original.stockReceiptId || original.receiptCorrectionId || original.supplierCreditLineId || original.foodPreparationBatchId || original.cropHarvestBatchId || original.saleReturnItemId || original.saleReturnReversalItemId) {
          throw Object.assign(new Error("This entry must be corrected through its source workflow. Older entries without a verified manual source cannot be reversed here."), { status: 409 });
        }
        if (original.reversal) throw Object.assign(new Error("This stock movement was already reversed"), { status: 409 });
        const delta = original.stockBefore !== null && original.stockAfter !== null
          ? roundQuantity(original.stockAfter - original.stockBefore)
          : original.type === "IN" ? original.quantity : -original.quantity;
        const product = await tx.product.findFirst({ where: { id: original.productId, shopId } });
        if (!product) throw Object.assign(new Error("Product not found"), { status: 404 });
        const nextStock = roundQuantity(product.currentStock - delta);
        if (nextStock < 0) throw Object.assign(new Error("Cannot reverse: some stock was already used. Record a separate correction with the real counted quantity."), { status: 409 });
        const changed = await tx.product.updateMany({ where: { id: product.id, shopId, currentStock: product.currentStock }, data: { currentStock: nextStock } });
        if (changed.count !== 1) throw Object.assign(new Error("Stock changed on another device. Refresh and try again."), { status: 409 });
        return tx.stockMovement.create({ data: {
          productId: product.id, type: delta > 0 ? "OUT" : delta < 0 ? "IN" : "ADJUSTMENT",
          quantity: Math.abs(delta) || nextStock, note: `Correction: ${reason}`,
          manualAdjustment: true, stockBefore: product.currentStock, stockAfter: nextStock,
          reversalOfId: original.id, requestKey, requestHash,
        } });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      const saved = await replay();
      if (saved?.requestHash === requestHash) { reversal = saved; reused = true; }
      else if (error.code === "P2002" || error.code === "P2034") return res.status(409).json({ error: "This movement changed during correction. Refresh stock history and try again." });
      else throw error;
    }
  }
  if (!reused) {
    await invalidateDashboardHistory(shopId);
    req.audit = { action: "stock.manual.reverse", resourceType: "stock_movement", resourceId: reversal.id, metadata: { reversalOfId: movementId, productId: reversal.productId, quantity: reversal.quantity } };
  }
  res.status(reused ? 200 : 201).json({ movement: reversal, reused });
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
        supplierCreditLine: { select: { supplierCredit: { select: { id: true, kind: true, stockReceiptId: true, reversalOfId: true, reversal: { select: { id: true } } } } } },
        saleReturnItem: { select: { saleReturn: { select: { shopId: true, reversal: { select: { id: true } }, sale: { select: { receiptNumber: true } } } } } },
        saleReturnReversalItem: { select: { saleReturnItem: { select: { saleReturn: { select: { shopId: true, sale: { select: { receiptNumber: true } } } } } } } },
        reversal: { select: { id: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.stockMovement.count({ where }),
  ]);

  const receiptIds = [...new Set(movements.map((movement) => movement.stockReceiptId || movement.supplierCreditLine?.supplierCredit.stockReceiptId).filter(Boolean))];
  const productIds = [...new Set(movements.map((movement) => movement.productId).filter(Boolean))];
  const [receipts, receiptItems] = receiptIds.length ? await Promise.all([
    prisma.stockReceipt.findMany({ where: { shopId, id: { in: receiptIds } }, select: {
      id: true, invoiceNumber: true, voidedAt: true,
      supplier: { select: { id: true, name: true } },
      stockCorrections: { take: 1, select: { id: true } },
    } }),
    prisma.stockReceiptItem.findMany({ where: { stockReceiptId: { in: receiptIds }, productId: { in: productIds }, stockReceipt: { is: { shopId } } }, select: {
      stockReceiptId: true, productId: true, quantity: true,
      supplierCreditLines: { where: { supplierCredit: { is: { kind: "RETURN" } } }, select: { quantity: true } },
    } }),
  ]) : [[], []];
  const receiptById = new Map(receipts.map((receipt) => [receipt.id, receipt]));
  const itemByReceiptAndProduct = new Map(receiptItems.map((item) => [`${item.stockReceiptId}:${item.productId}`, item]));
  const decorated = movements.map((movement) => {
    const credit = movement.supplierCreditLine?.supplierCredit;
    const receiptId = movement.stockReceiptId || credit?.stockReceiptId;
    const receipt = receiptById.get(receiptId);
    const item = itemByReceiptAndProduct.get(`${receiptId}:${movement.productId}`);
    const customerReturn = movement.saleReturnItem?.saleReturn;
    const customerReturnReversal = movement.saleReturnReversalItem?.saleReturnItem.saleReturn;
    let source = "OTHER";
    if (credit?.kind === "RETURN") source = credit.reversalOfId ? "SUPPLIER_RETURN_REVERSAL" : "SUPPLIER_RETURN";
    else if (customerReturnReversal?.shopId === shopId) source = "CUSTOMER_RETURN_REVERSAL";
    else if (customerReturn?.shopId === shopId) source = "CUSTOMER_RETURN";
    else if (movement.receiptCorrectionId) source = "RECEIPT_CORRECTION";
    else if (receipt) source = "RECEIPT";
    else if (movement.reversalOfId) source = "MANUAL_REVERSAL";
    else if (movement.manualAdjustment) source = "MANUAL";
    return {
      ...movement,
      supplierCreditLine: undefined,
      saleReturnItem: undefined,
      saleReturnReversalItem: undefined,
      source,
      sourceReversed: Boolean(credit?.reversal?.id || (customerReturn?.shopId === shopId && customerReturn.reversal?.id)),
      saleReceiptNumber: customerReturn?.shopId === shopId ? customerReturn.sale.receiptNumber
        : customerReturnReversal?.shopId === shopId ? customerReturnReversal.sale.receiptNumber : null,
      receiptContext: receipt ? {
        id: receipt.id, invoiceNumber: receipt.invoiceNumber, supplier: receipt.supplier,
        receivedQuantity: item?.quantity ?? null,
        returnedQuantity: item?.supplierCreditLines.reduce((sum, line) => sum + line.quantity, 0) ?? 0,
        returnReversed: item?.supplierCreditLines.some((line) => line.quantity < 0) ?? false,
        corrected: receipt.stockCorrections.length > 0,
        reversed: Boolean(receipt.voidedAt),
      } : null,
    };
  });

  res.json({ movements: decorated, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

module.exports = { adjust, reverseManualMovement, movements, history };
