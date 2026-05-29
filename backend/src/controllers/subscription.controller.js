const prisma = require("../lib/prisma");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
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

  res.json({
    plan: shop.plan,
    isActive: shop.isActive,
    trialEndsAt: shop.trialEndsAt,
    subscriptionEndsAt: shop.subscriptionEndsAt,
    trialActive,
    subActive,
    daysLeft,
    status: !shop.isActive ? "suspended" : trialActive ? "trial" : subActive ? "active" : "expired",
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
      createdAt: true,
      user: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  // Compute status for each
  const enriched = shops.map((s) => {
    const trialActive = s.plan === "FREE_TRIAL" && s.trialEndsAt && s.trialEndsAt > now;
    const subActive = s.subscriptionEndsAt && s.subscriptionEndsAt > now;
    const computedStatus = !s.isActive ? "suspended" : trialActive ? "trial" : subActive ? "active" : "expired";
    const daysLeft = s.trialEndsAt ? Math.max(0, Math.ceil((s.trialEndsAt - now) / (1000 * 60 * 60 * 24))) : null;
    return { ...s, computedStatus, daysLeft };
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
  const { plan, trialEndsAt, subscriptionEndsAt, isActive } = req.body;

  const updateData = {};
  if (plan) updateData.plan = String(plan);
  if (trialEndsAt !== undefined) updateData.trialEndsAt = trialEndsAt ? new Date(trialEndsAt) : null;
  if (subscriptionEndsAt !== undefined) updateData.subscriptionEndsAt = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
  if (isActive !== undefined) updateData.isActive = Boolean(isActive);

  const shop = await prisma.shop.update({
    where: { id: shopId },
    data: updateData,
    select: { id: true, name: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true },
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

module.exports = { getStatus, adminListSubscriptions, adminUpdateSubscription, adminExtendTrial };
