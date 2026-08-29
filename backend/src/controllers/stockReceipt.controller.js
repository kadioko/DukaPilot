const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const PAYMENT_METHODS = new Set(["CASH", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "HALOPESA", "BANK"]);

function parseDate(value) {
  if (value === undefined || value === null || value === "") return new Date();
  const text = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00.000Z`) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function distributeLandedCost(items, transportCost, otherCost) {
  const additionalCost = transportCost + otherCost;
  const productTotal = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  let allocated = 0;
  return items.map((item, index) => {
    const productCost = item.quantity * item.unitCost;
    const allocatedAdditionalCost = index === items.length - 1
      ? additionalCost - allocated
      : Math.floor((productCost * additionalCost) / productTotal);
    allocated += allocatedAdditionalCost;
    const landedTotalCost = productCost + allocatedAdditionalCost;
    return {
      ...item,
      productCost,
      allocatedAdditionalCost,
      landedTotalCost,
      landedUnitCost: Math.round(landedTotalCost / item.quantity),
    };
  });
}

function allocateEstimatedGroceryCost(items, totalGroceryBill, transportCost, otherCost, productsById) {
  const weightedItems = items.map((item) => ({
    ...item,
    // Use the last known buying cost as a weight. If there is no history at
    // all, quantity gives every received unit an equal share instead.
    allocationWeight: Math.max(0, (productsById.get(item.productId)?.buyingPrice || 0) * item.quantity),
  }));
  const pricedWeight = weightedItems.reduce((sum, item) => sum + item.allocationWeight, 0);
  const totalWeight = pricedWeight || weightedItems.reduce((sum, item) => sum + item.quantity, 0);
  let allocatedGrocery = 0;
  let allocatedExtras = 0;
  const extraCost = transportCost + otherCost;
  return weightedItems.map((item, index) => {
    const weight = totalWeight === 0 ? 0 : (pricedWeight ? item.allocationWeight : item.quantity);
    const productCost = index === weightedItems.length - 1
      ? totalGroceryBill - allocatedGrocery
      : Math.floor((weight * totalGroceryBill) / totalWeight);
    const allocatedAdditionalCost = index === weightedItems.length - 1
      ? extraCost - allocatedExtras
      : Math.floor((weight * extraCost) / totalWeight);
    allocatedGrocery += productCost;
    allocatedExtras += allocatedAdditionalCost;
    const landedTotalCost = productCost + allocatedAdditionalCost;
    return {
      productId: item.productId,
      quantity: item.quantity,
      unitCost: Math.round(productCost / item.quantity),
      productCost,
      allocatedAdditionalCost,
      landedTotalCost,
      landedUnitCost: Math.round(landedTotalCost / item.quantity),
    };
  });
}

function normalizeItems(rawItems, requireUnitCost = true) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return null;
  const seen = new Set();
  const items = rawItems.map((item) => ({
    productId: String(item.productId || "").trim(),
    quantity: Number(item.quantity),
    unitCost: Number(item.unitCost),
  }));
  if (items.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0 || (requireUnitCost && (!Number.isInteger(item.unitCost) || item.unitCost < 0)))) return null;
  if (items.some((item) => seen.has(item.productId) || !seen.add(item.productId))) return null;
  return items;
}

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const receipts = await prisma.stockReceipt.findMany({
    where: { shopId },
    include: {
      supplier: { select: { id: true, name: true } },
      items: { include: { product: { select: { id: true, name: true, unit: true } } } },
    },
    orderBy: { receivedAt: "desc" },
    take: 50,
  });
  res.json({ receipts });
});

const receive = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const allocationMode = String(req.body.allocationMode || "DIRECT").toUpperCase();
  const estimatedTotalMode = allocationMode === "TOTAL_ESTIMATE";
  const items = normalizeItems(req.body.items, !estimatedTotalMode);
  const totalGroceryBill = Number(req.body.totalGroceryBill || 0);
  const supplierId = String(req.body.supplierId || "").trim() || null;
  const sourceOrderId = String(req.body.sourceOrderId || "").trim() || null;
  const invoiceNumber = String(req.body.invoiceNumber || "").trim() || null;
  const note = String(req.body.note || "").trim() || null;
  const transportCost = Number(req.body.transportCost || 0);
  const otherCost = Number(req.body.otherCost || 0);
  const paymentMethod = String(req.body.paymentMethod || "CASH").toUpperCase();
  const receivedAt = parseDate(req.body.receivedAt);

  if (!["DIRECT", "TOTAL_ESTIMATE"].includes(allocationMode)) return res.status(400).json({ error: "Choose a valid cost allocation mode" });
  if (!items) return res.status(400).json({ error: estimatedTotalMode ? "Add each grocery item once with a whole quantity" : "Add each product once with a whole quantity and unit buying cost" });
  if (estimatedTotalMode && (!Number.isInteger(totalGroceryBill) || totalGroceryBill <= 0)) return res.status(400).json({ error: "Total grocery bill must be a whole TZS amount greater than 0" });
  if (!Number.isInteger(transportCost) || transportCost < 0 || !Number.isInteger(otherCost) || otherCost < 0) {
    return res.status(400).json({ error: "Transport and other costs must be whole TZS amounts of 0 or more" });
  }
  if (!PAYMENT_METHODS.has(paymentMethod)) return res.status(400).json({ error: "Choose a valid payment method" });
  if (!receivedAt) return res.status(400).json({ error: "Received date is invalid" });

  const receipt = await prisma.$transaction(async (tx) => {
    let receiptSupplierId = supplierId;
    if (supplierId) {
      const supplier = await tx.supplier.findUnique({ where: { id: supplierId }, select: { id: true } });
      if (!supplier) throw Object.assign(new Error("Supplier not found"), { status: 404 });
    }
    if (sourceOrderId) {
      const order = await tx.order.findFirst({
        where: { id: sourceOrderId, shopId },
        select: { id: true, supplierId: true, status: true, items: { select: { productId: true } } },
      });
      if (!order) throw Object.assign(new Error("Supplier order not found"), { status: 404 });
      if (!["CONFIRMED", "OUT_FOR_DELIVERY"].includes(order.status)) throw Object.assign(new Error("This supplier order is not ready to receive"), { status: 409 });
      if (supplierId && order.supplierId !== supplierId) throw Object.assign(new Error("Supplier must match the selected order"), { status: 400 });
      if (items.some((item) => !order.items.some((orderItem) => orderItem.productId === item.productId))) {
        throw Object.assign(new Error("Each received product must be on the selected supplier order"), { status: 400 });
      }
      receiptSupplierId = order.supplierId;
    }

    const products = await tx.product.findMany({ where: { id: { in: items.map((item) => item.productId) }, shopId, isActive: true } });
    if (products.length !== items.length) throw Object.assign(new Error("One or more products do not belong to this shop"), { status: 400 });
    const allocatedItems = estimatedTotalMode
      ? allocateEstimatedGroceryCost(items, totalGroceryBill, transportCost, otherCost, new Map(products.map((product) => [product.id, product])))
      : distributeLandedCost(items, transportCost, otherCost);
    const totalProductCost = allocatedItems.reduce((sum, item) => sum + item.productCost, 0);
    const totalLandedCost = totalProductCost + transportCost + otherCost;
    const created = await tx.stockReceipt.create({
      data: {
        shopId,
        supplierId: receiptSupplierId,
        sourceOrderId,
        invoiceNumber,
        paymentMethod,
        transportCost,
        otherCost,
        totalProductCost,
        totalLandedCost,
        allocationMode,
        estimatedAllocation: estimatedTotalMode,
        note,
        receivedAt,
        receivedBy: req.user.staffId || req.user.userId,
      },
    });

    for (const item of allocatedItems) {
      await tx.stockReceiptItem.create({
        data: { ...item, stockReceiptId: created.id, productId: item.productId },
      });
      await tx.product.update({ where: { id: item.productId }, data: { currentStock: { increment: item.quantity }, buyingPrice: item.landedUnitCost } });
      await tx.stockMovement.create({
        data: {
          type: "IN",
          quantity: item.quantity,
          note: invoiceNumber ? `Stock receipt ${invoiceNumber}` : `Stock receipt #${created.id.slice(-6)}`,
          productId: item.productId,
          stockReceiptId: created.id,
        },
      });
    }
    if (sourceOrderId) await tx.order.update({ where: { id: sourceOrderId }, data: { status: "DELIVERED" } });
    return tx.stockReceipt.findUnique({
      where: { id: created.id },
      include: { supplier: { select: { id: true, name: true } }, items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
    });
  });

  req.audit = { action: "stock_receipt.create", resourceType: "stock_receipt", resourceId: receipt.id, metadata: { supplierId: receipt.supplierId, sourceOrderId, totalLandedCost: receipt.totalLandedCost, itemCount: receipt.items.length } };
  res.status(201).json({ receipt });
});

module.exports = { list, receive, distributeLandedCost, allocateEstimatedGroceryCost };
