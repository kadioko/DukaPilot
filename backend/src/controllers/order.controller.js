const prisma = require("../lib/prisma");
const { buildWhatsAppOrderMessage } = require("../services/whatsapp.service");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function getShop(userId) {
  const shop = await prisma.shop.findUnique({ where: { userId } });
  if (!shop) throw Object.assign(new Error("Shop not found"), { status: 404 });
  return shop;
}

const list = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user.userId);
  const { status } = req.query;

  const where = { shopId: shop.id };
  if (status) where.status = status.toUpperCase();

  const orders = await prisma.order.findMany({
    where,
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      items: {
        include: { product: { select: { id: true, name: true, unit: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ orders });
});

const create = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user.userId);
  const { supplierId, items, note } = req.body;

  if (!supplierId || !items || items.length === 0) {
    return res.status(400).json({ error: "supplierId and items are required" });
  }

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) return res.status(404).json({ error: "Supplier not found" });

  const normalizedItems = items.map((item) => ({
    productId: String(item.productId || ""),
    quantity: Number(item.quantity),
    unitPrice: item.unitPrice,
  }));

  if (normalizedItems.some((item) => !item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0)) {
    return res.status(400).json({ error: "Each order item must include a productId and quantity greater than 0" });
  }

  const productIds = normalizedItems.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, shopId: shop.id, isActive: true },
  });
  if (products.length !== productIds.length) {
    return res.status(400).json({ error: "One or more products not found in this shop" });
  }
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  let totalAmount = 0;
  const orderItemsData = normalizedItems.map((item) => {
    const product = productMap[item.productId];
    if (!product) throw Object.assign(new Error(`Product ${item.productId} not found`), { status: 400 });
    const unitPrice = item.unitPrice || product.buyingPrice;
    totalAmount += unitPrice * item.quantity;
    return {
      quantity: item.quantity,
      unitPrice,
      productId: item.productId,
    };
  });

  const order = await prisma.order.create({
    data: {
      shopId: shop.id,
      supplierId,
      note,
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

  // Generate WhatsApp message for the order
  const whatsappMessage = buildWhatsAppOrderMessage(order, shop);

  res.status(201).json({ order, whatsappMessage });
});

const get = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user.userId);
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
  const shop = await getShop(req.user.userId);
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

// Confirm received delivery: record stock movements
const confirmDelivery = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user.userId);
  const order = await prisma.order.findFirst({
    where: { id: req.params.id, shopId: shop.id },
    include: { items: true },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.status !== "OUT_FOR_DELIVERY" && order.status !== "CONFIRMED") {
    return res.status(400).json({ error: "Order is not out for delivery or confirmed" });
  }

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { currentStock: { increment: item.quantity } },
      });
      await tx.stockMovement.create({
        data: {
          type: "IN",
          quantity: item.quantity,
          note: `Order delivery #${order.id.slice(-6)}`,
          productId: item.productId,
        },
      });
    }
    await tx.order.update({
      where: { id: order.id },
      data: { status: "DELIVERED" },
    });
  });

  res.json({ message: "Delivery confirmed and stock updated" });
});

// One-tap reorder based on previous order
const reorder = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user.userId);
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

module.exports = { list, create, get, cancel, confirmDelivery, reorder };
