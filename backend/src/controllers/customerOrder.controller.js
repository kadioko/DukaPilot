const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { normalizePhone } = require("../lib/phone");
const { findOpenCashSession } = require("../lib/cashSession");

const PAYMENT_METHODS = new Set(["CASH", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "HALOPESA", "BANK", "CREDIT"]);

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function getShop(user) {
  const shopId = await getShopIdForUser(user);
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw Object.assign(new Error("Shop not found"), { status: 404 });
  return shop;
}

function orderInclude(includeStock = false) {
  return {
    items: {
      include: {
        product: { select: { id: true, name: true, unit: true, ...(includeStock ? { currentStock: true, buyingPrice: true } : {}) } },
      },
    },
    convertedSale: { select: { id: true, receiptNumber: true, paymentMethod: true, createdAt: true } },
  };
}

// GET /api/customer-orders — list customer orders for this merchant's shop
const list = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  const { status, limit = 50 } = req.query;

  const where = { shopId: shop.id };
  if (status) where.status = String(status).toUpperCase();

  const orders = await prisma.customerOrder.findMany({
    where,
    include: orderInclude(),
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
    include: orderInclude(true),
  });

  if (!order) return res.status(404).json({ error: "Customer order not found" });
  res.json({ order });
});

// PATCH /api/customer-orders/:id/status — advance or cancel a customer order
// CONFIRMED: reserve stock (decrement)
// Sale completion records revenue separately, with stock already reserved at CONFIRMED.
// CANCELLED: release stock if it was reserved
const updateStatus = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  const newStatus = String(req.body.status || "").toUpperCase();

  const transitions = {
    PENDING: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["OUT_FOR_DELIVERY", "CANCELLED"],
    OUT_FOR_DELIVERY: ["CANCELLED"],
  };

  const order = await prisma.customerOrder.findFirst({
    where: { id: req.params.id, shopId: shop.id },
    include: { items: true, convertedSale: { select: { id: true } } },
  });

  if (!order) return res.status(404).json({ error: "Customer order not found" });

  if (order.convertedSale || !(transitions[order.status] || []).includes(newStatus)) {
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
    include: orderInclude(),
  });

  res.json({ order: updated });
});

// POST /api/customer-orders/:id/convert — turn a fulfilled catalog order into
// one sale. Stock was reserved at confirmation, so this transaction never
// deducts it a second time.
const convertToSale = asyncHandler(async (req, res) => {
  const shop = await getShop(req.user);
  const paymentMethod = String(req.body.paymentMethod || "CASH").toUpperCase();
  const paymentRef = String(req.body.paymentRef || "").trim() || null;
  if (!PAYMENT_METHODS.has(paymentMethod)) return res.status(400).json({ error: "Choose a valid payment method" });

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const order = await tx.customerOrder.findFirst({
        where: { id: req.params.id, shopId: shop.id },
        include: {
          items: { include: { product: { select: { id: true, name: true, unit: true, buyingPrice: true } } } },
          convertedSale: { select: { id: true, receiptNumber: true } },
        },
      });
      if (!order) throw Object.assign(new Error("Customer order not found"), { status: 404 });
      if (order.convertedSale) return { sale: order.convertedSale, reused: true };
      if (!["CONFIRMED", "OUT_FOR_DELIVERY", "DELIVERED"].includes(order.status)) {
        throw Object.assign(new Error("Confirm and dispatch this order before recording the sale"), { status: 409 });
      }

      // The status guard owns the transition. It also lets pre-existing
      // delivered orders be repaired once without reopening their stock.
      if (order.status !== "DELIVERED") {
        const transitioned = await tx.customerOrder.updateMany({
          where: { id: order.id, shopId: shop.id, status: order.status },
          data: { status: "DELIVERED", convertedAt: new Date() },
        });
        if (transitioned.count !== 1) throw Object.assign(new Error("Customer order changed. Refresh and try again."), { status: 409 });
      } else {
        await tx.customerOrder.update({ where: { id: order.id }, data: { convertedAt: new Date() } });
      }

      const counter = await tx.shop.update({
        where: { id: shop.id },
        data: { nextSaleNumber: { increment: 1 } },
        select: { nextSaleNumber: true },
      });
      const receiptNumber = counter.nextSaleNumber - 1;
      const pricingTier = order.items.every((item) => item.pricingTier === "WHOLESALE") ? "WHOLESALE" : "RETAIL";
      const items = order.items.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        buyingPrice: item.buyingPrice ?? item.product.buyingPrice,
        totalPrice: item.unitPrice * item.quantity,
        productId: item.productId,
      }));
      const profit = items.reduce((sum, item) => sum + (item.unitPrice - item.buyingPrice) * item.quantity, 0);
      const cashSession = paymentMethod === "CASH" ? await findOpenCashSession(tx, shop.id, req.user) : null;
      const sale = await tx.sale.create({
        data: {
          totalAmount: order.totalAmount,
          profit,
          paymentMethod,
          paymentRef,
          channel: "ONLINE",
          pricingTier,
          customerName: order.customerName,
          customerPhone: normalizePhone(order.customerPhone),
          customerOrderId: order.id,
          note: `Customer catalog order #${order.id.slice(-6)}`,
          receiptNumber,
          cashSessionId: cashSession?.id || null,
          shopId: shop.id,
          items: { create: items },
        },
        include: { items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
      });
      if (paymentMethod === "CREDIT") {
        await tx.debt.create({
          data: {
            customerName: order.customerName,
            customerPhone: normalizePhone(order.customerPhone),
            amount: order.totalAmount,
            note: `Customer catalog order #${order.id.slice(-6)}`,
            saleId: sale.id,
            shopId: shop.id,
          },
        });
      }
      return { sale, reused: false };
    });
  } catch (error) {
    // A retry after a dropped response must return the original sale without
    // generating another receipt, debt, or payment record.
    if (error?.code !== "P2002") throw error;
    const existing = await prisma.sale.findFirst({ where: { customerOrderId: req.params.id, shopId: shop.id } });
    if (!existing) throw error;
    result = { sale: existing, reused: true };
  }

  req.audit = {
    action: result.reused ? "customerOrder.sale.reused" : "customerOrder.sale.convert",
    resourceType: "customerOrder",
    resourceId: req.params.id,
    metadata: { saleId: result.sale.id, paymentMethod, receiptNumber: result.sale.receiptNumber },
  };
  res.status(result.reused ? 200 : 201).json(result);
});

module.exports = { list, get, updateStatus, convertToSale };
