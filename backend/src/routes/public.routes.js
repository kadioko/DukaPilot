const router = require("express").Router();
const prisma = require("../lib/prisma");
const { buildCustomerOrderMessage, sendWhatsAppMessage } = require("../services/whatsapp.service");

function activeShopWhere(now = new Date()) {
  return {
    isActive: true,
    isCatalogPublished: true,
    isDemo: false,
    OR: [
      { plan: "FREE_TRIAL", trialEndsAt: { gt: now } },
      { subscriptionEndsAt: { gt: now } },
    ],
  };
}

function isPublicShopActive(shop, now = new Date()) {
  return Boolean(
    shop?.isActive &&
    ((shop.plan === "FREE_TRIAL" && shop.trialEndsAt && shop.trialEndsAt > now) ||
      (shop.subscriptionEndsAt && shop.subscriptionEndsAt > now))
  );
}

function cleanMarketingValue(value) {
  return typeof value === "string" ? value.trim().slice(0, 120) || null : null;
}

const MARKETING_EVENTS = new Set(["page_view", "cta_click", "whatsapp_click", "registration_started"]);

router.post("/events", async (req, res, next) => {
  try {
    const { eventName, sessionId, source, medium, campaign, content, details } = req.body || {};
    if (!MARKETING_EVENTS.has(eventName) || typeof sessionId !== "string" || sessionId.length < 8 || sessionId.length > 80) {
      return res.status(400).json({ error: "Invalid marketing event" });
    }

    const pagePath = cleanMarketingValue(details?.path);
    const safeDetails = eventName === "page_view" || eventName === "registration_started" || eventName === "whatsapp_click"
      ? { placement: cleanMarketingValue(details?.placement), intent: cleanMarketingValue(details?.intent) }
      : null;

    await prisma.marketingEvent.create({
      data: {
        eventName,
        sessionId,
        pagePath,
        source: cleanMarketingValue(source),
        medium: cleanMarketingValue(medium),
        campaign: cleanMarketingValue(campaign),
        content: cleanMarketingValue(content),
        details: safeDetails,
      },
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/shops -> list shops that have active products
router.get("/shops", async (req, res, next) => {
  try {
    const now = new Date();
    const shops = await prisma.shop.findMany({
      where: { ...activeShopWhere(now), products: { some: { isActive: true, currentStock: { gt: 0 } } } },
      select: {
        id: true,
        name: true,
        location: true,
        district: true,
        category: true,
        _count: { select: { products: { where: { isActive: true, currentStock: { gt: 0 } } } } },
      },
      orderBy: { name: "asc" },
    });

    res.json({
      shops: shops.map((s) => ({
        id: s.id,
        name: s.name,
        location: s.location,
        district: s.district,
        category: s.category,
        productCount: s._count.products,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/products?shopId=&search= -> browse active products
router.get("/products", async (req, res, next) => {
  try {
    const { shopId, search, limit = 60, offset = 0 } = req.query;
    const where = { isActive: true, currentStock: { gt: 0 }, shop: activeShopWhere() };
    if (shopId) where.shopId = String(shopId);
    if (search) where.name = { contains: String(search), mode: "insensitive" };

    const take = Math.min(Math.max(Number(limit) || 60, 1), 100);
    const skip = Math.max(Number(offset) || 0, 0);
    const [products, total] = await Promise.all([prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        unit: true,
        sellingPrice: true,
        wholesalePrice: true,
        wholesaleMinQty: true,
        currentStock: true,
        shop: { select: { id: true, name: true, location: true, category: true } },
      },
      orderBy: [{ shop: { name: "asc" } }, { name: "asc" }],
      take,
      skip,
    }), prisma.product.count({ where })]);

    res.json({ products, pagination: { total, limit: take, offset: skip, hasMore: skip + products.length < total } });
  } catch (err) {
    next(err);
  }
});

// GET /api/public/shops/:id -> single shop with products
router.get("/shops/:id", async (req, res, next) => {
  try {
    const shop = await prisma.shop.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        location: true,
        district: true,
        category: true,
        plan: true,
        trialEndsAt: true,
        subscriptionEndsAt: true,
        isActive: true,
        isCatalogPublished: true,
        isDemo: true,
        user: { select: { phone: true } },
        _count: { select: { products: { where: { isActive: true, currentStock: { gt: 0 } } } } },
      },
    });
    if (!shop) return res.status(404).json({ error: "Shop not found" });
    if (!shop.isCatalogPublished || shop.isDemo || !isPublicShopActive(shop)) return res.status(404).json({ error: "Shop not available" });

    const products = await prisma.product.findMany({
      where: { shopId: req.params.id, isActive: true, currentStock: { gt: 0 } },
      select: {
        id: true,
        name: true,
        unit: true,
        sellingPrice: true,
        wholesalePrice: true,
        wholesaleMinQty: true,
        currentStock: true,
      },
      orderBy: { name: "asc" },
    });

    res.json({
      shop: {
        id: shop.id,
        name: shop.name,
        location: shop.location,
        district: shop.district,
        category: shop.category,
        phone: shop.user.phone,
        productCount: shop._count.products,
      },
      products,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/public/orders -> customer places an order
router.post("/orders", async (req, res, next) => {
  try {
    const { shopId, customerName, customerPhone, items, note } = req.body;

    if (!shopId || !customerName || !customerPhone || !items || items.length === 0) {
      return res.status(400).json({ error: "shopId, customerName, customerPhone, and items are required" });
    }

    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      include: { user: { select: { phone: true } } },
    });
    if (!shop) return res.status(404).json({ error: "Shop not found" });
    if (!shop.isCatalogPublished || shop.isDemo || !isPublicShopActive(shop)) {
      return res.status(402).json({ error: "This shop is not currently accepting catalog orders" });
    }

    const normalizedItems = items.map((item) => ({
      productId: String(item.productId || ""),
      quantity: Number(item.quantity),
      pricingTier: item.pricingTier,
    }));
    if (normalizedItems.some((item) => !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      return res.status(400).json({ error: "Each item must include a productId and a whole-number quantity greater than 0" });
    }

    const productIds = normalizedItems.map((i) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, shopId, isActive: true, currentStock: { gt: 0 } },
    });
    if (products.length !== productIds.length) {
      return res.status(400).json({ error: "One or more products not available" });
    }

    const productMap = Object.fromEntries(products.map((p) => [p.id, p]));
    let totalAmount = 0;
    const orderItemsData = normalizedItems.map((item) => {
      const product = productMap[item.productId];
      if (product.currentStock < item.quantity) {
        throw Object.assign(
          new Error(`Insufficient stock for ${product.name}: have ${product.currentStock}, need ${item.quantity}`),
          { status: 400 }
        );
      }
      const tier = String(item.pricingTier || "RETAIL").toUpperCase() === "WHOLESALE" ? "WHOLESALE" : "RETAIL";
      const unitPrice = tier === "WHOLESALE" && product.wholesalePrice != null
        ? product.wholesalePrice
        : product.sellingPrice;
      totalAmount += unitPrice * item.quantity;
      return { quantity: item.quantity, unitPrice, pricingTier: tier, productId: item.productId };
    });

    const order = await prisma.customerOrder.create({
      data: {
        customerName,
        customerPhone,
        note,
        totalAmount,
        shopId,
        items: { create: orderItemsData },
      },
      include: {
        items: { include: { product: { select: { id: true, name: true, unit: true } } } },
      },
    });

    // Notify shop owner via WhatsApp (fire-and-forget)
    const shopPhone = shop.user?.phone;
    const { message, whatsappUrl } = buildCustomerOrderMessage(
      { ...order, user: shop.user },
      { ...shop, phone: shopPhone }
    );
    if (shopPhone) {
      sendWhatsAppMessage(shopPhone, message).catch(() => {});
    }

    res.status(201).json({ order: { id: order.id, totalAmount: order.totalAmount }, shopWhatsAppUrl: whatsappUrl });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
