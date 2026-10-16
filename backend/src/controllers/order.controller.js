const prisma = require("../lib/prisma");
const { buildWhatsAppOrderMessage } = require("../services/whatsapp.service");
const { getShopIdForUser } = require("../lib/shopAccess");
const { findVisibleSupplier } = require("../lib/supplierAccess");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function getShop(user) {
  const shopId = await getShopIdForUser(user);
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw Object.assign(new Error("Shop not found"), { status: 404 });
  return shop;
}

function orderInclude() {
  return {
    supplier: { select: { id: true, name: true, phone: true } },
    items: { include: { product: { select: { id: true, name: true, unit: true } } } },
  };
}

function normalizeInvoiceNumber(value) {
  const invoiceNumber = String(value || "").trim().toUpperCase();
  return invoiceNumber || null;
}

async function prepareOrder(shop, body) {
  const supplierId = String(body.supplierId || "").trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!supplierId || !items.length) throw Object.assign(new Error("supplierId and items are required"), { status: 400 });

  const supplier = await findVisibleSupplier(prisma, supplierId, shop.id, { select: { id: true } });
  if (!supplier) throw Object.assign(new Error("Supplier not found"), { status: 404 });

  const normalizedItems = items.map((item) => ({
    productId: String(item.productId || ""),
    quantity: Number(item.quantity),
    unitPrice: item.unitPrice === undefined || item.unitPrice === null || item.unitPrice === "" ? null : Number(item.unitPrice),
  }));
  if (normalizedItems.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0 || (item.unitPrice !== null && (!Number.isInteger(item.unitPrice) || item.unitPrice < 0)))) {
    throw Object.assign(new Error("Each order item needs a product, whole positive quantity, and optional whole TZS buying price"), { status: 400 });
  }
  const productIds = normalizedItems.map((item) => item.productId);
  if (new Set(productIds).size !== productIds.length) throw Object.assign(new Error("Each product can appear only once in an order"), { status: 400 });

  const products = await prisma.product.findMany({ where: { id: { in: productIds }, shopId: shop.id, isActive: true } });
  if (products.length !== productIds.length) throw Object.assign(new Error("One or more products not found in this shop"), { status: 400 });
  const productMap = Object.fromEntries(products.map((product) => [product.id, product]));
  let totalAmount = 0;
  const orderItemsData = normalizedItems.map((item) => {
    const product = productMap[item.productId];
    const unitPrice = item.unitPrice ?? product.buyingPrice;
    totalAmount += unitPrice * item.quantity;
    return { quantity: item.quantity, unitPrice, productId: item.productId };
  });
  const invoiceNumber = normalizeInvoiceNumber(body.invoiceNumber);
  if (invoiceNumber && invoiceNumber.length > 120) throw Object.assign(new Error("Invoice number must be 120 characters or less"), { status: 400 });
  return { supplierId, invoiceNumber, note: String(body.note || "").trim() || null, totalAmount, orderItemsData };
}

const matchByInvoice = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  const supplierId = String(req.query.supplierId || "").trim();
  const invoiceNumber = normalizeInvoiceNumber(req.query.invoiceNumber);
  if (!supplierId || !invoiceNumber) return res.status(400).json({ error: "Supplier and invoice number are required" });
  const supplier = await findVisibleSupplier(prisma, supplierId, shop.id, { select: { id: true } });
  if (!supplier) return res.status(404).json({ error: "Supplier not found" });

  const orders = await prisma.order.findMany({
    where: {
      shopId: shop.id,
      supplierId,
      invoiceNumber: { equals: invoiceNumber, mode: "insensitive" },
      status: { in: ["PENDING", "CONFIRMED", "OUT_FOR_DELIVERY", "PARTIALLY_RECEIVED"] },
    },
    include: orderInclude(),
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  res.json({ orders });
});

const list = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  const { status } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 100);

  const where = { shopId: shop.id };
  if (status) where.status = status.toUpperCase();

  const [orders, total] = await Promise.all([prisma.order.findMany({
    where,
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      items: {
        include: { product: { select: { id: true, name: true, unit: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  }), prisma.order.count({ where })]);

  res.json({ orders, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
});

const create = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  let prepared;
  try {
    prepared = await prepareOrder(shop, req.body);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || "Could not create order" });
  }
  const { supplierId, invoiceNumber, note, totalAmount, orderItemsData } = prepared;

  const order = await prisma.order.create({
    data: {
      shopId: shop.id,
      supplierId,
      invoiceNumber,
      note,
      totalAmount,
      items: { create: orderItemsData },
    },
    include: orderInclude(),
  });

  // Generate WhatsApp message for the order
  const whatsappMessage = buildWhatsAppOrderMessage(order, shop);

  res.status(201).json({ order, whatsappMessage });
});

const get = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, shopId: shop.id },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      items: {
        include: { product: { select: { id: true, name: true, unit: true, buyingPrice: true } } },
      },
    },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });

  const whatsappMessage = buildWhatsAppOrderMessage(order, shop);
  res.json({ order, whatsappMessage });
});

const cancel = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "orders" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', req.params.id, shop.id);
      const order = await tx.order.findFirst({
        where: { id: req.params.id, shopId: shop.id },
        select: { id: true, status: true },
      });
      if (!order) return { notFound: true };
      if (["DELIVERED", "CANCELLED"].includes(order.status)) {
        return { conflictStatus: order.status };
      }

      const update = await tx.order.updateMany({
        where: { id: order.id, shopId: shop.id, status: { notIn: ["DELIVERED", "CANCELLED"] } },
        data: { status: "CANCELLED" },
      });
      if (update.count !== 1) {
        const current = await tx.order.findFirst({ where: { id: order.id, shopId: shop.id }, select: { status: true } });
        return current ? { conflictStatus: current.status } : { notFound: true };
      }
      return { order: await tx.order.findFirst({ where: { id: order.id, shopId: shop.id } }) };
    });
  } catch (error) {
    if (error.code === "P2034") return res.status(409).json({ error: "This order changed while you were cancelling it. Refresh and try again." });
    throw error;
  }
  if (result.notFound) return res.status(404).json({ error: "Order not found" });
  if (result.conflictStatus) return res.status(400).json({ error: `Cannot cancel an order with status ${result.conflictStatus}` });
  res.json({ order: result.order });
});

// Receiving needs buying and landed costs, so old clients must move into the dedicated flow.
const confirmDelivery = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, shopId: shop.id },
    select: { id: true, status: true },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status !== "OUT_FOR_DELIVERY" && order.status !== "CONFIRMED") {
    return res.status(400).json({ error: "Order is not out for delivery or confirmed" });
  }
  res.status(409).json({
    code: "USE_STOCK_RECEIPT",
    error: "Use Receive Stock to record buying cost, transport, and stock history before confirming delivery",
  });
});

const update = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  let prepared;
  try {
    prepared = await prepareOrder(shop, req.body);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || "Could not update order" });
  }
  const { supplierId, invoiceNumber, note, totalAmount, orderItemsData } = prepared;
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "orders" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', req.params.id, shop.id);
      const existing = await tx.order.findFirst({ where: { id: req.params.id, shopId: shop.id }, select: { id: true, status: true } });
      if (!existing) return { notFound: true };
      if (existing.status !== "PENDING") return { conflictStatus: existing.status };
      const order = await tx.order.update({
        where: { id: existing.id },
        data: { supplierId, invoiceNumber, note, totalAmount, items: { deleteMany: {}, create: orderItemsData } },
        include: orderInclude(),
      });
      return { order };
    });
  } catch (error) {
    if (error.code === "P2034") return res.status(409).json({ error: "This order changed while it was being edited. Refresh and try again." });
    throw error;
  }
  if (result.notFound) return res.status(404).json({ error: "Order not found" });
  if (result.conflictStatus) return res.status(409).json({ error: "Only pending orders can be edited. Cancel and create a new order after the supplier starts processing it." });
  req.audit = { action: "order.update", resourceType: "order", resourceId: result.order.id, metadata: { itemCount: orderItemsData.length, supplierId } };
  res.json({ order: result.order, whatsappMessage: buildWhatsAppOrderMessage(result.order, shop) });
});

const updateInvoiceNumber = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  const invoiceNumber = normalizeInvoiceNumber(req.body.invoiceNumber);
  if (invoiceNumber && invoiceNumber.length > 120) return res.status(400).json({ error: "Invoice number must be 120 characters or less" });
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe('SELECT "id" FROM "orders" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', req.params.id, shop.id);
    const order = await tx.order.findFirst({ where: { id: req.params.id, shopId: shop.id }, select: { id: true, status: true } });
    if (!order) return { notFound: true };
    if (!["PENDING", "CONFIRMED", "OUT_FOR_DELIVERY"].includes(order.status)) return { conflictStatus: order.status };
    return { order: await tx.order.update({ where: { id: order.id }, data: { invoiceNumber }, include: orderInclude() }) };
  });
  if (result.notFound) return res.status(404).json({ error: "Order not found" });
  if (result.conflictStatus) return res.status(409).json({ error: "Invoice reference cannot be changed after receiving begins or the order is closed" });
  req.audit = { action: "order.invoice.update", resourceType: "order", resourceId: result.order.id, metadata: { hasInvoiceNumber: Boolean(invoiceNumber) } };
  res.json({ order: result.order });
});

const updateTrackingStatus = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  const status = String(req.body.status || "").toUpperCase();
  if (!["CONFIRMED", "OUT_FOR_DELIVERY"].includes(status)) {
    return res.status(400).json({ error: "Choose Confirmed or Out for delivery. Receipt and cancellation statuses are updated through their own workflows." });
  }
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT "id" FROM "orders" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', req.params.id, shop.id);
      const current = await tx.order.findFirst({ where: { id: req.params.id, shopId: shop.id }, select: { id: true, status: true } });
      if (!current) return { notFound: true };
      if (!["PENDING", "CONFIRMED", "OUT_FOR_DELIVERY"].includes(current.status)) return { conflictStatus: current.status };
      const allowedNext = current.status === "PENDING" ? ["CONFIRMED", "OUT_FOR_DELIVERY"] : ["OUT_FOR_DELIVERY"];
      if (status !== current.status && !allowedNext.includes(status)) return { invalidTransition: current.status };
      const updated = await tx.order.update({ where: { id: current.id }, data: { status }, include: orderInclude() });
      return { order: updated, previousStatus: current.status };
    });
  } catch (error) {
    if (error.code === "P2034") return res.status(409).json({ error: "This order changed while its status was being updated. Refresh and try again." });
    throw error;
  }
  if (result.notFound) return res.status(404).json({ error: "Order not found" });
  if (result.conflictStatus) return res.status(409).json({ error: `Order status ${result.conflictStatus} is controlled by receiving or cancellation and cannot be manually changed` });
  if (result.invalidTransition) return res.status(409).json({ error: `Order status cannot move backwards from ${result.invalidTransition}` });
  req.audit = { action: "order.trackingStatus.update", resourceType: "order", resourceId: result.order.id, metadata: { from: result.previousStatus, to: status } };
  res.json({ order: result.order });
});

const remove = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe('SELECT "id" FROM "orders" WHERE "id" = $1 AND "shopId" = $2 FOR UPDATE', req.params.id, shop.id);
    const existing = await tx.order.findFirst({ where: { id: req.params.id, shopId: shop.id }, select: { id: true, status: true } });
    if (!existing) return { notFound: true };
    if (!["PENDING", "CANCELLED"].includes(existing.status)) return { conflictStatus: existing.status };
    const receiptCount = await tx.stockReceipt.count({ where: { sourceOrderId: existing.id, shopId: shop.id } });
    if (receiptCount > 0) return { hasReceipts: true };
    await tx.order.delete({ where: { id: existing.id } });
    return { deletedId: existing.id };
  });
  if (result.notFound) return res.status(404).json({ error: "Order not found" });
  if (result.conflictStatus) return res.status(409).json({ error: "Only pending or cancelled orders can be deleted. Confirmed and delivered orders remain as part of the purchasing history." });
  if (result.hasReceipts) return res.status(409).json({ error: "This order has stock receipt history and cannot be deleted. Keep the order and cancel any unreceived remainder." });
  req.audit = { action: "order.delete", resourceType: "order", resourceId: result.deletedId };
  res.json({ message: "Order deleted" });
});

// One-tap reorder based on previous order
const reorder = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  const previousOrder = await prisma.order.findFirst({
    where: { id: req.params.id, shopId: shop.id },
    include: { items: true },
  });
  if (!previousOrder) return res.status(404).json({ error: "Order not found" });

  const products = await prisma.product.findMany({
    where: { id: { in: previousOrder.items.map((i) => i.productId) } },
  });
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  let totalAmount = 0;
  const orderItemsData = previousOrder.items.map((item) => {
    const product = productMap[item.productId];
    const unitPrice = product?.buyingPrice || item.unitPrice;
    totalAmount += (unitPrice || 0) * item.quantity;
    return { quantity: item.quantity, unitPrice, productId: item.productId };
  });

  const newOrder = await prisma.order.create({
    data: {
      shopId: shop.id,
      supplierId: previousOrder.supplierId,
      note: `Reorder of #${previousOrder.id.slice(-6)}`,
      totalAmount,
      items: { create: orderItemsData },
    },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      items: {
        include: { product: { select: { id: true, name: true, unit: true } } },
      },
    },
  });

  const whatsappMessage = buildWhatsAppOrderMessage(newOrder, shop);
  res.status(201).json({ order: newOrder, whatsappMessage });
});

module.exports = { list, create, update, remove, get, cancel, confirmDelivery, reorder, matchByInvoice, updateInvoiceNumber, updateTrackingStatus };
