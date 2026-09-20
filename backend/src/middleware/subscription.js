const prisma = require("../lib/prisma");
const { getShopIdForUser, getBillingShopIdForUser } = require("../lib/shopAccess");

function isSubscriptionActive(shop) {
  const now = new Date();
  const trialActive = shop.plan === "FREE_TRIAL" && shop.trialEndsAt && shop.trialEndsAt > now;
  const subActive = shop.subscriptionEndsAt && shop.subscriptionEndsAt > now;
  return Boolean(shop.isActive && (trialActive || subActive));
}

function requireActiveSubscription(req, res, next) {
  if (req.user.role === "ADMIN") return next();
  // Route handlers use each of the standard write methods. Keeping this list
  // complete prevents a new PUT endpoint from accidentally bypassing billing.
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();

  Promise.resolve()
    .then(async () => {
      const [operatingShopId, billingShopId] = await Promise.all([
        getShopIdForUser(req.user),
        getBillingShopIdForUser(req.user),
      ]);
      const [operatingShop, billingShop] = await Promise.all([
        prisma.shop.findUnique({ where: { id: operatingShopId }, select: { id: true, name: true, parentShopId: true, branchArchived: true } }),
        prisma.shop.findUnique({
        where: { id: billingShopId },
        select: { id: true, name: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true },
        }),
      ]);
      if (!operatingShop || !billingShop) return res.status(404).json({ error: "Shop not found" });
      if (operatingShop.parentShopId && operatingShop.branchArchived) {
        return res.status(403).json({ error: "This branch is archived. Select an active branch before recording changes." });
      }
      if (isSubscriptionActive(billingShop)) return next();

      return res.status(402).json({
        error: "Subscription required",
        code: "SUBSCRIPTION_REQUIRED",
        message: "Your DukaPilot trial or subscription has expired. Contact support on WhatsApp to reactivate your shop.",
        whatsapp: "https://wa.me/255743910580",
      });
    })
    .catch(next);
}

function isCatalogUnpublishOnly(req) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const keys = Object.keys(body);
  return req.method === "PATCH"
    && keys.length === 1
    && keys[0] === "isCatalogPublished"
    && body.isCatalogPublished === false;
}

function requireActiveSubscriptionOrCatalogUnpublish(req, res, next) {
  if (isCatalogUnpublishOnly(req)) return next();
  return requireActiveSubscription(req, res, next);
}

module.exports = {
  requireActiveSubscription,
  requireActiveSubscriptionOrCatalogUnpublish,
  isCatalogUnpublishOnly,
  isSubscriptionActive,
};
