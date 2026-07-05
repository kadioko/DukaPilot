const prisma = require("../lib/prisma");
const { isSubscriptionActive } = require("../middleware/subscription");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function reminderStage(status, daysLeft) {
  if (status === "expired") return "EXPIRED";
  if (status === "suspended") return "SUSPENDED";
  if (daysLeft === null || daysLeft === undefined) return null;
  if (daysLeft <= 1) return "DUE_1_DAY";
  if (daysLeft <= 3) return "DUE_3_DAYS";
  if (daysLeft <= 7) return "DUE_7_DAYS";
  return null;
}

// Get current shop's subscription status
const getStatus = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const shop = await prisma.shop.findUnique({
    where: { userId },
    select: { id: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true, createdAt: true },
  });
  if (!shop) return res.status(404).json({ error: "Shop not found" });

  const now = new Date();
  const trialActive = shop.plan === "FREE_TRIAL" && shop.trialEndsAt && shop.trialEndsAt > now;
  const subActive = shop.subscriptionEndsAt && shop.subscriptionEndsAt > now;
  const daysLeft = shop.trialEndsAt
    ? Math.max(0, Math.ceil((shop.trialEndsAt - now) / (1000 * 60 * 60 * 24)))
    : null;

  const status = !shop.isActive ? "suspended" : trialActive ? "trial" : subActive ? "active" : "expired";
  res.json({
    plan: shop.plan,
    isActive: shop.isActive,
    trialEndsAt: shop.trialEndsAt,
    subscriptionEndsAt: shop.subscriptionEndsAt,
    trialActive,
    subActive,
    daysLeft,
    status,
    reminderStage: reminderStage(status, daysLeft),
  });
});

// Admin: list all subscriptions
const adminListSubscriptions = asyncHandler(async (req, res) => {
  const { plan, status } = req.query;
  const now = new Date();

  const shops = await prisma.shop.findMany({
    select: {
      id: true,
      name: true,
      plan: true,
      trialEndsAt: true,
      subscriptionEndsAt: true,
      isActive: true,
      onboardingStatus: true,
      lastContactedAt: true,
      followUpNotes: true,
      createdAt: true,
      user: { select: { id: true, name: true, phone: true } },
      subscriptionPayments: { orderBy: { paidAt: "desc" }, take: 1 },
      _count: {
        select: {
          products: { where: { isActive: true } },
          sales: true,
          orders: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const shopIds = shops.map((s) => s.id);
  const secondDaySaleRows = shopIds.length
    ? await prisma.sale.groupBy({
        by: ["shopId"],
        where: {
          shopId: { in: shopIds },
        },
        _min: { createdAt: true },
        _max: { createdAt: true },
      })
    : [];
  const saleSpanByShop = new Map(secondDaySaleRows.map((row) => [row.shopId, row]));

  // Compute status for each
  const enriched = shops.map((s) => {
    const trialActive = s.plan === "FREE_TRIAL" && s.trialEndsAt && s.trialEndsAt > now;
    const subActive = s.subscriptionEndsAt && s.subscriptionEndsAt > now;
    const computedStatus = !s.isActive ? "suspended" : trialActive ? "trial" : subActive ? "active" : "expired";
    const daysLeft = s.trialEndsAt ? Math.max(0, Math.ceil((s.trialEndsAt - now) / (1000 * 60 * 60 * 24))) : null;
    const saleSpan = saleSpanByShop.get(s.id);
    const firstSaleAt = saleSpan?._min.createdAt || null;
    const lastSaleAt = saleSpan?._max.createdAt || null;
    const secondDayReturn = Boolean(firstSaleAt && lastSaleAt && lastSaleAt.getTime() - firstSaleAt.getTime() >= 24 * 60 * 60 * 1000);
    const activation = {
      productCount: s._count.products,
      salesCount: s._count.sales,
      orderCount: s._count.orders,
      secondDayReturn,
      activated: s._count.products >= 10 && s._count.sales >= 10 && secondDayReturn,
    };
    return { ...s, computedStatus, daysLeft, reminderStage: reminderStage(computedStatus, daysLeft), lastPayment: s.subscriptionPayments[0] || null, activation };
  });

  // Filter
  let filtered = enriched;
  if (plan) filtered = filtered.filter((s) => s.plan === plan);
  if (status) filtered = filtered.filter((s) => s.computedStatus === status);

  res.json({ shops: filtered, total: filtered.length });
});

// Admin: update a shop's subscription
const adminUpdateSubscription = asyncHandler(async (req, res) => {
  const { shopId } = req.params;
  const { plan, trialEndsAt, subscriptionEndsAt, isActive, onboardingStatus, lastContactedAt, followUpNotes } = req.body;

  const updateData = {};
  if (plan) updateData.plan = String(plan);
  if (trialEndsAt !== undefined) updateData.trialEndsAt = trialEndsAt ? new Date(trialEndsAt) : null;
  if (subscriptionEndsAt !== undefined) updateData.subscriptionEndsAt = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
  if (isActive !== undefined) updateData.isActive = Boolean(isActive);
  if (onboardingStatus !== undefined) {
    const nextStatus = String(onboardingStatus).toUpperCase();
    if (!["NEW", "CONTACTED", "NEEDS_HELP", "SETUP_DONE", "ACTIVATED", "PAID", "CONVERTED", "CHURN_RISK"].includes(nextStatus)) {
      return res.status(400).json({ error: "Invalid onboarding status" });
    }
    updateData.onboardingStatus = nextStatus;
  }
  if (lastContactedAt !== undefined) updateData.lastContactedAt = lastContactedAt ? new Date(lastContactedAt) : null;
  if (followUpNotes !== undefined) updateData.followUpNotes = String(followUpNotes || "").trim() || null;

  const shop = await prisma.shop.update({
    where: { id: shopId },
    data: updateData,
    select: {
      id: true,
      name: true,
      plan: true,
      trialEndsAt: true,
      subscriptionEndsAt: true,
      isActive: true,
      onboardingStatus: true,
      lastContactedAt: true,
      followUpNotes: true,
    },
  });

  req.audit = {
    action: "admin.subscription.updated",
    resourceType: "shop",
    resourceId: shopId,
    metadata: { adminId: req.user.userId, changes: updateData },
  };

  res.json({ shop });
});

// Admin: extend trial by N days
const adminExtendTrial = asyncHandler(async (req, res) => {
  const { shopId } = req.params;
  const days = Number(req.body.days) || 7;

  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { trialEndsAt: true } });
  if (!shop) return res.status(404).json({ error: "Shop not found" });

  const base = shop.trialEndsAt && shop.trialEndsAt > new Date() ? shop.trialEndsAt : new Date();
  const newDate = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  const updated = await prisma.shop.update({
    where: { id: shopId },
    data: { trialEndsAt: newDate, plan: "FREE_TRIAL" },
    select: { id: true, name: true, plan: true, trialEndsAt: true },
  });

  res.json({ shop: updated, message: `Trial extended by ${days} days` });
});

const adminRecordPayment = asyncHandler(async (req, res) => {
  const { shopId } = req.params;
  const plan = String(req.body.plan || "BASIC").toUpperCase();
  const months = Math.max(1, Math.min(24, Number(req.body.months) || 1));
  const amount = Number(req.body.amount);
  const method = String(req.body.method || "MANUAL").toUpperCase();
  const reference = String(req.body.reference || "").trim() || null;
  const note = String(req.body.note || "").trim() || null;

  if (!["BASIC", "PRO"].includes(plan)) return res.status(400).json({ error: "Plan must be BASIC or PRO" });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Payment amount must be positive" });

  const existing = await prisma.shop.findUnique({ where: { id: shopId }, select: { subscriptionEndsAt: true } });
  if (!existing) return res.status(404).json({ error: "Shop not found" });

  const base = existing.subscriptionEndsAt && existing.subscriptionEndsAt > new Date() ? existing.subscriptionEndsAt : new Date();
  const subscriptionEndsAt = new Date(base);
  subscriptionEndsAt.setMonth(subscriptionEndsAt.getMonth() + months);

  const [payment, shop] = await prisma.$transaction([
    prisma.subscriptionPayment.create({
      data: { shopId, plan, amount, months, method, reference, note },
    }),
    prisma.shop.update({
      where: { id: shopId },
      data: { plan, subscriptionEndsAt, isActive: true },
      select: { id: true, name: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true },
    }),
  ]);

  req.audit = {
    action: "admin.subscription.paymentRecorded",
    resourceType: "shop",
    resourceId: shopId,
    metadata: { adminId: req.user.userId, paymentId: payment.id, plan, amount, months, method },
  };

  res.status(201).json({ payment, shop, active: isSubscriptionActive(shop) });
});

module.exports = { getStatus, adminListSubscriptions, adminUpdateSubscription, adminExtendTrial, adminRecordPayment };
