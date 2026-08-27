const prisma = require("../lib/prisma");
const { buildWhatsAppOrderMessage } = require("../services/whatsapp.service");
const { getShopIdForUser } = require("../lib/shopAccess");

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

async function prepareOrder(shop, body) {
  const supplierId = String(body.supplierId || "").trim();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!supplierId || !items.length) throw Object.assign(new Error("supplierId and items are required"), { status: 400 });

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId }, select: { id: true } });
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
  return { supplierId, note: String(body.note || "").trim() || null, totalAmount, orderItemsData };
}

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
  const { supplierId, note, totalAmount, orderItemsData } = prepared;

  const order = await prisma.order.create({
    data: {
      shopId: shop.id,
      supplierId,
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
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, shopId: shop.id },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (["DELIVERED", "CANCELLED"].includes(order.status)) {
    return res.status(400).json({ error: `Cannot cancel an order with status ${order.status}` });
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status: "CANCELLED" },
  });
  res.json({ order: updated });
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
  const existing = await prisma.order.findFirst({ where: { id: req.params.id, shopId: shop.id }, select: { id: true, status: true } });
  if (!existing) return res.status(404).json({ error: "Order not found" });
  if (existing.status !== "PENDING") return res.status(409).json({ error: "Only pending orders can be edited. Cancel and create a new order after the supplier starts processing it." });

  let prepared;
  try {
    prepared = await prepareOrder(shop, req.body);
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message || "Could not update order" });
  }
  const { supplierId, note, totalAmount, orderItemsData } = prepared;
  const order = await prisma.order.update({
    where: { id: existing.id },
    data: { supplierId, note, totalAmount, items: { deleteMany: {}, create: orderItemsData } },
    include: orderInclude(),
  });
  req.audit = { action: "order.update", resourceType: "order", resourceId: order.id, metadata: { itemCount: orderItemsData.length, supplierId } };
  res.json({ order, whatsappMessage: buildWhatsAppOrderMessage(order, shop) });
});

const remove = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  const existing = await prisma.order.findFirst({ where: { id: req.params.id, shopId: shop.id }, select: { id: true, status: true } });
  if (!existing) return res.status(404).json({ error: "Order not found" });
  if (existing.status !== "PENDING") return res.status(409).json({ error: "Only pending orders can be deleted. Cancel an order already sent to the supplier." });
  await prisma.order.delete({ where: { id: existing.id } });
  req.audit = { action: "order.delete", resourceType: "order", resourceId: existing.id };
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

module.exports = { list, create, update, remove, get, cancel, confirmDelivery, reorder };
