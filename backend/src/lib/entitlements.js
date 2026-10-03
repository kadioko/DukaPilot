const prisma = require("./prisma");
const { getShopIdForUser, getBillingShopIdForUser } = require("./shopAccess");

const PLAN_FEATURES = {
  BASIC: new Set(["CORE", "EXPORTS", "STAFF"]),
  PRO: new Set(["CORE", "EXPORTS", "STAFF", "ASSISTANT", "BRANCHES"]),
};

function activePlan(shop, now = new Date()) {
  if (!shop?.isActive) return null;
  if (shop.plan === "FREE_TRIAL" && shop.trialEndsAt && shop.trialEndsAt > now) return "FREE_TRIAL";
  if (shop.subscriptionEndsAt && shop.subscriptionEndsAt > now) return shop.plan;
  return null;
}

function canUseFeature(shop, feature, now = new Date()) {
  const plan = activePlan(shop, now);
  if (plan === "FREE_TRIAL") return PLAN_FEATURES.PRO.has(feature);
  return Boolean(plan && PLAN_FEATURES[plan]?.has(feature));
}

function featureSnapshot(shop) {
  return {
    staff: canUseFeature(shop, "STAFF"),
    assistant: canUseFeature(shop, "ASSISTANT"),
    exports: canUseFeature(shop, "EXPORTS"),
    branches: canUseFeature(shop, "BRANCHES"),
  };
}

function requireFeature(feature) {
  return async (req, res, next) => {
    if (req.user.role === "ADMIN") return next();
    try {
      const [shopId, billingShopId] = await Promise.all([getShopIdForUser(req.user), getBillingShopIdForUser(req.user)]);
      const operatingShop = await prisma.shop.findUnique({ where: { id: shopId }, select: { parentShopId: true, branchArchived: true } });
      if (!operatingShop || (operatingShop.parentShopId && operatingShop.branchArchived)) {
        return res.status(403).json({ error: "This branch is archived. Select an active branch first." });
      }
      const shop = await prisma.shop.findUnique({
        where: { id: billingShopId },
        select: { plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true },
      });
      if (canUseFeature(shop, feature)) return next();
      return res.status(403).json({
        error: "Pro plan required",
        code: "PLAN_UPGRADE_REQUIRED",
        feature,
        message: "This feature is available on DukaPilot Pro. Upgrade your plan or contact support.",
        whatsapp: "https://wa.me/255743910580",
      });
    } catch (error) {
      next(error);
    }
  };
}

function requireAssistantAccess(req, res, next) {
  if (req.user.role === "ADMIN" || !req.user.staffId || req.user.permissions?.canUseAssistant) return next();
  return res.status(403).json({
    error: "Your owner has not enabled AI Assistant for your staff account.",
    code: "STAFF_AI_ACCESS_NOT_GRANTED",
  });
}

function branchLimit(shop) {
  const plan = activePlan(shop);
  if (plan === "FREE_TRIAL") return 4;
  return plan === "PRO" ? 4 + Math.max(0, Number(shop.additionalBranchSlots) || 0) : 1;
}

module.exports = { activePlan, canUseFeature, featureSnapshot, branchLimit, requireFeature, requireAssistantAccess };
