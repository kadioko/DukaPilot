const prisma = require("../lib/prisma");
const crypto = require("crypto");
const { getShopIdForUser } = require("../lib/shopAccess");
const { findOpenCashSession } = require("../lib/cashSession");
const { findVisibleSupplier } = require("../lib/supplierAccess");
const { invalidateDashboardHistory } = require("../services/dashboard-cache.service");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const PAYMENT_METHODS = new Set(["CASH", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "HALOPESA", "BANK", "CREDIT"]);

function parseDate(value) {
  if (value === undefined || value === null || value === "") return new Date();
  const text = String(value).trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00.000Z`) : new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function distributeLandedCost(items, transportCost, otherCost) {
  const additionalCost = transportCost + otherCost;
  const productTotal = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const allocationWeightTotal = productTotal || items.reduce((sum, item) => sum + item.quantity, 0);
  let allocated = 0;
  return items.map((item, index) => {
    const productCost = item.quantity * item.unitCost;
    const allocationWeight = productTotal ? productCost : item.quantity;
    const allocatedAdditionalCost = index === items.length - 1
      ? additionalCost - allocated
      : Math.floor((allocationWeight * additionalCost) / allocationWeightTotal);
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
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.some((item) => !item || typeof item !== "object" || Array.isArray(item))) return null;
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

function publicReceipt(receipt) {
  if (!receipt) return receipt;
  const { requestKey, requestHash, ...safe } = receipt;
  return safe;
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
  res.json({ receipts: receipts.map(publicReceipt) });
});

const receive = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const requestKey = String(req.body.requestKey || "").trim() || crypto.randomUUID();
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
  const requestedPaidAtReceipt = req.body.paidAtReceipt === undefined || req.body.paidAtReceipt === null || req.body.paidAtReceipt === ""
    ? null
    : Number(req.body.paidAtReceipt);
  const paymentReference = String(req.body.paymentReference || "").trim() || null;
  const receivedAt = parseDate(req.body.receivedAt);

  if (!["DIRECT", "TOTAL_ESTIMATE"].includes(allocationMode)) return res.status(400).json({ error: "Choose a valid cost allocation mode" });
  if (!items) return res.status(400).json({ error: estimatedTotalMode ? "Add each grocery item once with a whole quantity" : "Add each product once with a whole quantity and unit buying cost" });
  if (estimatedTotalMode && (!Number.isInteger(totalGroceryBill) || totalGroceryBill <= 0)) return res.status(400).json({ error: "Total grocery bill must be a whole TZS amount greater than 0" });
  if (!Number.isInteger(transportCost) || transportCost < 0 || !Number.isInteger(otherCost) || otherCost < 0) {
    return res.status(400).json({ error: "Transport and other costs must be whole TZS amounts of 0 or more" });
  }
  if (!PAYMENT_METHODS.has(paymentMethod)) return res.status(400).json({ error: "Choose a valid payment method" });
  if (!receivedAt) return res.status(400).json({ error: "Received date is invalid" });
  if (!/^[a-f0-9-]{16,80}$/i.test(requestKey)) return res.status(400).json({ error: "A valid receipt retry key is required" });

  const hashItems = [...(items || [])].sort((a, b) => a.productId.localeCompare(b.productId));
  const suppliedReceivedAt = req.body.receivedAt !== undefined && req.body.receivedAt !== null && req.body.receivedAt !== "";
  function fingerprint(date, legacy = false) {
    return crypto.createHash("sha256").update(JSON.stringify({
      allocationMode, totalGroceryBill: estimatedTotalMode ? totalGroceryBill : null,
      supplierId, sourceOrderId, invoiceNumber, note, transportCost, otherCost,
      paymentMethod, ...(!legacy ? { paidAtReceipt: requestedPaidAtReceipt, paymentReference } : {}),
      receivedAt: date, items: hashItems,
    })).digest("hex");
  }
  // A server-generated timestamp must not change the retry fingerprint. Older
  // receipts hashed that timestamp, so reconstruct it from the saved receipt.
  const requestHash = fingerprint(suppliedReceivedAt ? receivedAt.toISOString() : null);
  function matchesRequest(saved) {
    if (!saved) return false;
    if (saved.requestHash === requestHash) return true;
    const originalDate = suppliedReceivedAt ? receivedAt : saved.receivedAt;
    if (!originalDate) return false;
    const date = new Date(originalDate).toISOString();
    if (saved.requestHash === fingerprint(date)) return true;
    if (saved.requestHash !== fingerprint(date, true)) return false;
    const originalPaid = saved.paidAtReceipt ?? (saved.paymentMethod === "CREDIT" ? 0 : saved.totalLandedCost);
    const requestedPaid = requestedPaidAtReceipt ?? (paymentMethod === "CREDIT" ? 0 : saved.totalLandedCost);
    return originalPaid === requestedPaid && (saved.paymentReference || null) === paymentReference;
  }

  let receipt;
  let reused = false;
  try {
    receipt = await prisma.$transaction(async (tx) => {
    const replay = await tx.stockReceipt.findFirst({
      where: { shopId, requestKey },
      include: { supplier: { select: { id: true, name: true } }, items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
    });
    if (replay) {
      if (!matchesRequest(replay)) throw Object.assign(new Error("This receipt retry key was already used for different details"), { status: 409 });
      reused = true;
      return replay;
    }

    let receiptSupplierId = supplierId;
    if (supplierId) {
      const supplier = await findVisibleSupplier(tx, supplierId, shopId, { select: { id: true } });
      if (!supplier) throw Object.assign(new Error("Supplier not found"), { status: 404 });
    }
    if (sourceOrderId) {
      await tx.$queryRawUnsafe('SELECT "id" FROM "orders" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', sourceOrderId, shopId);
      const order = await tx.order.findFirst({
        where: { id: sourceOrderId, shopId },
        select: { id: true, supplierId: true, status: true, items: { select: { id: true, productId: true, quantity: true, receivedQuantity: true } } },
      });
      if (!order) throw Object.assign(new Error("Supplier order not found"), { status: 404 });
      if (!["PENDING", "CONFIRMED", "OUT_FOR_DELIVERY", "PARTIALLY_RECEIVED"].includes(order.status)) throw Object.assign(new Error("This supplier order is not ready to receive"), { status: 409 });
      if (supplierId && order.supplierId !== supplierId) throw Object.assign(new Error("Supplier must match the selected order"), { status: 400 });
      for (const item of items) {
        const orderItem = order.items.find((candidate) => candidate.productId === item.productId);
        if (!orderItem) throw Object.assign(new Error("Each received product must be on the selected supplier order"), { status: 400 });
        if (item.quantity > orderItem.quantity - orderItem.receivedQuantity) throw Object.assign(new Error(`Received quantity exceeds the remaining ordered quantity for product ${item.productId}`), { status: 409 });
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
    const paidAtReceipt = requestedPaidAtReceipt === null ? totalLandedCost : requestedPaidAtReceipt;
    if (!Number.isInteger(paidAtReceipt) || paidAtReceipt < 0 || paidAtReceipt > totalLandedCost) throw Object.assign(new Error("Amount paid now must be a whole TZS amount between 0 and the receipt total"), { status: 400 });
    if (paymentMethod === "CREDIT" && paidAtReceipt > 0) throw Object.assign(new Error("Choose a payment method for the amount paid now, or set it to 0 for supplier credit"), { status: 400 });
    const effectivePaymentMethod = paidAtReceipt === 0 ? "CREDIT" : paymentMethod;
    const cashSession = paidAtReceipt > 0 && effectivePaymentMethod === "CASH" ? await findOpenCashSession(tx, shopId, req.user) : null;
    if (paidAtReceipt > 0 && effectivePaymentMethod === "CASH" && !cashSession) {
      throw Object.assign(new Error("Open your cash shift before recording a cash stock purchase so it appears in Daily Close"), { status: 409 });
    }
    const created = await tx.stockReceipt.create({
      data: {
        shopId,
        requestKey,
        requestHash,
        supplierId: receiptSupplierId,
        sourceOrderId,
        invoiceNumber,
        paymentMethod: effectivePaymentMethod,
        paidAtReceipt,
        paymentReference,
        transportCost,
        otherCost,
        totalProductCost,
        totalLandedCost,
        allocationMode,
        estimatedAllocation: estimatedTotalMode,
        note,
        receivedAt,
        receivedBy: req.user.staffId || req.user.userId,
        cashSessionId: cashSession?.id || null,
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
    if (sourceOrderId) {
      for (const item of allocatedItems) {
        await tx.orderItem.updateMany({ where: { orderId: sourceOrderId, productId: item.productId }, data: { receivedQuantity: { increment: item.quantity } } });
      }
      const updatedItems = await tx.orderItem.findMany({ where: { orderId: sourceOrderId }, select: { quantity: true, receivedQuantity: true } });
      const fullyReceived = updatedItems.every((item) => item.receivedQuantity >= item.quantity);
      await tx.order.update({ where: { id: sourceOrderId }, data: { status: fullyReceived ? "DELIVERED" : "PARTIALLY_RECEIVED" } });
    }
    return tx.stockReceipt.findUnique({
      where: { id: created.id },
      include: { supplier: { select: { id: true, name: true } }, items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
    });
    });
  } catch (error) {
    if (error.code === "P2034") {
      const replay = await prisma.stockReceipt.findFirst({
        where: { shopId, requestKey },
        include: { supplier: { select: { id: true, name: true } }, items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
      });
      if (matchesRequest(replay)) {
        reused = true;
        receipt = replay;
      } else if (replay) return res.status(409).json({ error: "This receipt retry key was already used for different details" });
      else return res.status(409).json({ error: "Another receipt was recorded at the same time. Refresh stock and try again." });
    } else if (error.code !== "P2002") throw error;
    if (error.code === "P2002") {
      const replay = await prisma.stockReceipt.findFirst({
        where: { shopId, requestKey },
        include: { supplier: { select: { id: true, name: true } }, items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
      });
      if (!replay) throw error;
      if (!matchesRequest(replay)) throw Object.assign(new Error("This receipt retry key was already used for different details"), { status: 409 });
      reused = true;
      receipt = replay;
    }
  }

  if (!reused) {
    await invalidateDashboardHistory(shopId);
    req.audit = { action: "stock_receipt.create", resourceType: "stock_receipt", resourceId: receipt.id, metadata: { supplierId: receipt.supplierId, sourceOrderId, paymentMethod, cashSessionId: receipt.cashSessionId || null, totalLandedCost: receipt.totalLandedCost, itemCount: receipt.items.length } };
  }
  res.status(reused ? 200 : 201).json({ receipt: publicReceipt(receipt), reused });
});

module.exports = { list, receive, distributeLandedCost, allocateEstimatedGroceryCost };
