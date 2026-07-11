const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { startOfTanzaniaDay, startOfTanzaniaMonth } = require("../lib/businessTime");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const VALID_PAYMENT_METHODS = ['CASH', 'MPESA', 'TIGOPESA', 'AIRTEL_MONEY', 'HALOPESA', 'BANK', 'CREDIT'];
const VALID_CHANNELS = ['POS', 'ONLINE'];

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { from, to, limit = 50, offset = 0, paymentMethod, channel } = req.query;

  const where = { shopId };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  if (paymentMethod) {
    const pm = paymentMethod.toUpperCase();
    if (VALID_PAYMENT_METHODS.includes(pm)) where.paymentMethod = pm;
  }
  if (channel) {
    const ch = channel.toUpperCase();
    if (VALID_CHANNELS.includes(ch)) where.channel = ch;
  }

  const [sales, total] = await Promise.all([
    prisma.sale.findMany({
      where,
      include: {
        items: {
          include: { product: { select: { id: true, name: true, unit: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Number(limit),
      skip: Number(offset),
    }),
    prisma.sale.count({ where }),
  ]);

  res.json({ sales, total });
});

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { items, paymentMethod = "CASH", paymentRef, customerName, customerPhone, note, saleMode, channel, clientReference } = req.body;
  const normalizedPaymentMethod = String(paymentMethod || "CASH").toUpperCase();
  const pricingTier = String(saleMode || "RETAIL").toUpperCase() === "WHOLESALE" ? "WHOLESALE" : "RETAIL";
  const saleChannel = String(channel || "POS").toUpperCase() === "ONLINE" ? "ONLINE" : "POS";

  if (!items || items.length === 0) {
    return res.status(400).json({ error: "Sale must have at least one item" });
  }

  const normalizedClientReference = String(clientReference || "").trim() || null;
  if (normalizedClientReference && normalizedClientReference.length > 100) {
    return res.status(400).json({ error: "Sale reference must be 100 characters or less" });
  }
  if (normalizedClientReference) {
    const existingSale = await prisma.sale.findFirst({
      where: { shopId, clientReference: normalizedClientReference },
      include: { items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
    });
    if (existingSale) return res.json({ sale: existingSale, reused: true });
  }

  if (normalizedPaymentMethod === "CREDIT" && !customerPhone) {
    return res.status(400).json({ error: "Customer phone is required for credit sales" });
  }

  // Validate products belong to this shop and have sufficient stock
  const productIds = items.map((i) => i.productId);
  if (new Set(productIds).size !== productIds.length) {
    return res.status(400).json({ error: "Each product can appear only once in a sale" });
  }
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, shopId, isActive: true },
  });

  if (products.length !== productIds.length) {
    return res.status(400).json({ error: "One or more products not found in this shop" });
  }

  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  for (const item of items) {
    const product = productMap[item.productId];
    if (product.currentStock < item.quantity) {
      return res.status(400).json({
        error: `Insufficient stock for ${product.name}. Available: ${product.currentStock} ${product.unit}`,
      });
    }
  }

  let totalAmount = 0;
  let totalProfit = 0;
  const saleItemsData = items.map((item) => {
    const product = productMap[item.productId];
    const defaultPrice = pricingTier === "WHOLESALE" && product.wholesalePrice != null
      ? product.wholesalePrice
      : product.sellingPrice;
    const unitPrice = item.unitPrice != null && item.unitPrice !== "" ? Number(item.unitPrice) : defaultPrice;
    const totalPrice = unitPrice * item.quantity;
    const itemProfit = (unitPrice - product.buyingPrice) * item.quantity;
    totalAmount += totalPrice;
    totalProfit += itemProfit;
    return {
      quantity: item.quantity,
      unitPrice,
      buyingPrice: product.buyingPrice,
      totalPrice,
      productId: item.productId,
    };
  });

  // Create sale and update stock in a transaction.
  let sale;
  try {
    sale = await prisma.$transaction(async (tx) => {
    const newSale = await tx.sale.create({
      data: {
        totalAmount,
        profit: totalProfit,
        paymentMethod: normalizedPaymentMethod,
        paymentRef,
        channel: saleChannel,
        pricingTier,
        customerPhone,
        note,
        clientReference: normalizedClientReference,
        shopId,
        items: { create: saleItemsData },
      },
      include: {
        items: {
          include: { product: { select: { id: true, name: true, unit: true } } },
        },
      },
    });

    // Deduct stock with an in-transaction guard so concurrent sales cannot push stock negative.
    for (const item of items) {
      const product = productMap[item.productId];
      const updated = await tx.product.updateMany({
        where: { id: item.productId, shopId, isActive: true, currentStock: { gte: item.quantity } },
        data: { currentStock: { decrement: item.quantity } },
      });
      if (updated.count !== 1) {
        throw new Error(`Insufficient stock for ${product.name}. Available stock changed before checkout.`);
      }
      await tx.stockMovement.create({
        data: {
          type: "OUT",
          quantity: item.quantity,
          note: `Sale #${newSale.id.slice(-6)}`,
          productId: item.productId,
        },
      });
    }

    if (normalizedPaymentMethod === "CREDIT") {
      await tx.debt.create({
        data: {
          customerName: String(customerName || "").trim() || null,
          customerPhone,
          amount: totalAmount,
          note: note || `Credit sale #${newSale.id.slice(-6)}`,
          saleId: newSale.id,
          shopId,
        },
      });
    }

      return newSale;
    });
  } catch (error) {
    // If the phone lost the successful response, the retry returns the
    // committed sale instead of taking stock a second time.
    if (error?.code !== "P2002" || !normalizedClientReference) throw error;
    const existingSale = await prisma.sale.findFirst({
      where: { shopId, clientReference: normalizedClientReference },
      include: { items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
    });
    if (!existingSale) throw error;
    return res.json({ sale: existingSale, reused: true });
  }

  res.status(201).json({ sale });
});

const get = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const sale = await prisma.sale.findFirst({
    where: { id: req.params.id, shopId },
    include: {
      items: {
        include: { product: { select: { id: true, name: true, unit: true, sellingPrice: true } } },
      },
    },
  });
  if (!sale) return res.status(404).json({ error: "Sale not found" });
  res.json({ sale });
});

const summary = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { period = "today" } = req.query;

  let from;
  const now = new Date();
  if (period === "today") {
    from = startOfTanzaniaDay(now);
  } else if (period === "week") {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    from = startOfTanzaniaMonth(now);
  }

  const where = { shopId, createdAt: { gte: from } };
  const [sales, aggregate] = await Promise.all([
    prisma.sale.findMany({
      where,
      select: { id: true, totalAmount: true, profit: true, paymentMethod: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.sale.aggregate({
      where,
      _sum: { totalAmount: true, profit: true },
      _count: { id: true },
    }),
  ]);

  // Payment method breakdown
  const byPayment = {};
  for (const s of sales) {
    byPayment[s.paymentMethod] = (byPayment[s.paymentMethod] || 0) + s.totalAmount;
  }

  res.json({
    period,
    totalSales: aggregate._sum.totalAmount || 0,
    totalProfit: aggregate._sum.profit || 0,
    salesCount: aggregate._count.id,
    byPaymentMethod: byPayment,
    recentSales: sales.slice(0, 5),
  });
});

module.exports = { list, create, get, summary };
