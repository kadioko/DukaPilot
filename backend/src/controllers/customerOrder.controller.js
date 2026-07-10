const prisma = require("../lib/prisma");
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

// GET /api/customer-orders — list customer orders for this merchant's shop
const list = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  const { status, limit = 50 } = req.query;

  const where = { shopId: shop.id };
  if (status) where.status = String(status).toUpperCase();

  const orders = await prisma.customerOrder.findMany({
    where,
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, unit: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(limit) || 50, 200),
  });

  res.json({ orders });
});

// GET /api/customer-orders/:id — single order
const get = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);

  const order = await prisma.customerOrder.findFirst({
    where: { id: req.params.id, shopId: shop.id },
    include: {
      items: {
        include: {
          product: { select: { id: true, name: true, unit: true, currentStock: true } },
        },
      },
    },
  });

  if (!order) return res.status(404).json({ error: "Customer order not found" });
  res.json({ order });
});

// PATCH /api/customer-orders/:id/status — advance or cancel a customer order
// CONFIRMED: reserve stock (decrement)
// DELIVERED: mark fulfilled (stock already reserved at CONFIRMED)
// CANCELLED: release stock if it was reserved
const updateStatus = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  const newStatus = String(req.body.status || "").toUpperCase();

  const transitions = {
    PENDING: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["OUT_FOR_DELIVERY", "CANCELLED"],
    OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  };

  const order = await prisma.customerOrder.findFirst({
    where: { id: req.params.id, shopId: shop.id },
    include: { items: true },
  });

  if (!order) return res.status(404).json({ error: "Customer order not found" });

  if (!(transitions[order.status] || []).includes(newStatus)) {
    return res.status(400).json({ error: `Cannot move customer order from ${order.status} to ${newStatus || "an empty status"}` });
  }

  await prisma.$transaction(async (tx) => {
    const statusUpdate = await tx.customerOrder.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: newStatus },
    });
    if (statusUpdate.count !== 1) {
      throw Object.assign(new Error("Customer order status changed. Refresh and try again."), { status: 409 });
    }

    // Deduct stock when confirming (reserve)
    if (newStatus === "CONFIRMED" && order.status === "PENDING") {
      for (const item of order.items) {
        const product = await tx.product.findFirst({ where: { id: item.productId, shopId: shop.id, isActive: true } });
        if (!product) throw Object.assign(new Error(`Product not found: ${item.productId}`), { status: 404 });
        if (product.currentStock < item.quantity) {
          throw Object.assign(
            new Error(`Insufficient stock for ${product.name}: have ${product.currentStock}, need ${item.quantity}`),
            { status: 400 }
          );
        }
        const updated = await tx.product.updateMany({
          where: { id: item.productId, shopId: shop.id, isActive: true, currentStock: { gte: item.quantity } },
          data: { currentStock: { decrement: item.quantity } },
        });
        if (updated.count !== 1) {
          throw Object.assign(new Error(`Stock changed before ${product.name} could be reserved`), { status: 409 });
        }
        await tx.stockMovement.create({
          data: {
            type: "OUT",
            quantity: item.quantity,
            note: `Customer order #${order.id.slice(-6)} reserved`,
            productId: item.productId,
          },
        });
      }
    }

    // Release stock on cancellation (only if was CONFIRMED, stock was deducted)
    if (newStatus === "CANCELLED" && (order.status === "CONFIRMED" || order.status === "OUT_FOR_DELIVERY")) {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            type: "IN",
            quantity: item.quantity,
            note: `Customer order #${order.id.slice(-6)} cancelled — stock released`,
            productId: item.productId,
          },
        });
      }
    }

  });

  req.audit = {
    action: "customerOrder.status.update",
    resourceType: "customerOrder",
    resourceId: order.id,
    metadata: { from: order.status, to: newStatus },
  };

  const updated = await prisma.customerOrder.findUnique({
    where: { id: order.id },
    include: { items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
  });

  res.json({ order: updated });
});

module.exports = { list, get, updateStatus };
