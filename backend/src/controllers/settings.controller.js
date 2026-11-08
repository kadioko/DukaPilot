const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");
const { performance } = require("node:perf_hooks");
const { getShopIdForUser, getBillingShopIdForUser } = require("../lib/shopAccess");
const { recordRequestPhase } = require("../middleware/requestDiagnostics");
const { canUseFeature } = require("../lib/entitlements");
const cloudflareAi = require("../services/cloudflareAi.service");

const VALID_CATEGORIES = new Set(["grocery", "pharmacy", "beauty", "bar", "restaurant", "hardware", "electronics", "clothing", "livestock", "farm", "general"]);
const VALID_LANGUAGES = new Set(["en", "sw"]);
const HIDEABLE_MENU_ITEMS = new Set(["/assistant", "/daily-close", "/debts", "/orders/customers", "/quotations", "/receiving", "/food-preparation", "/farm", "/crops", "/barcodes", "/suppliers", "/orders", "/expenses", "/profit", "/wallet", "/billing", "/staff", "/branches", "/referrals"]);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

async function externalAiSettings(user) {
  const businessShopId = await getBillingShopIdForUser(user);
  if (!businessShopId) return { available: false, enabled: false, canManage: false, consentAt: null, dailyLimit: cloudflareAi.SHOP_DAILY_LIMIT };
  const shop = await prisma.shop.findUnique({ where: { id: businessShopId }, select: { id: true, userId: true, parentShopId: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, externalAiEnabled: true, externalAiConsentAt: true, externalAiConsentVersion: true } });
  const canManage = Boolean(!user.staffId && user.role === "MERCHANT" && shop?.userId === user.userId && !shop.parentShopId);
  return {
    available: canManage && canUseFeature(shop, "ASSISTANT") && cloudflareAi.isConfigured(),
    enabled: canManage && shop.externalAiEnabled === true && shop.externalAiConsentVersion === cloudflareAi.CONSENT_VERSION,
    canManage,
    consentAt: canManage ? shop.externalAiConsentAt : null,
    dailyLimit: cloudflareAi.SHOP_DAILY_LIMIT,
  };
}

// GET /api/settings — return current user + shop/supplier profile
const getSettings = asyncHandler(async (req, res) => {
  if (req.user.staffId) {
    const staff = await prisma.staffMember.findFirst({
      where: { id: req.user.staffId, isActive: true },
      select: {
        id: true,
        phone: true,
        name: true,
        role: true,
        language: true,
        createdAt: true,
        shop: { select: { id: true, name: true, location: true, district: true, category: true, isCatalogPublished: true, hiddenMenuItems: true } },
      },
    });
    if (!staff) return res.status(404).json({ error: "Staff member not found" });
    const businessShopId = await getBillingShopIdForUser(req.user);
    const business = await prisma.shop.findUnique({ where: { id: businessShopId }, select: { allowVariableSalePrices: true } });
    return res.json({ settings: { ...staff, isStaff: true, externalAi: { available: false, enabled: false, canManage: false, consentAt: null, dailyLimit: cloudflareAi.SHOP_DAILY_LIMIT }, shop: { ...staff.shop, allowVariableSalePrices: business?.allowVariableSalePrices === true } } });
  }
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      phone: true,
      name: true,
      role: true,
      language: true,
      shop: { select: { id: true, name: true, location: true, district: true, category: true, isCatalogPublished: true, hiddenMenuItems: true } },
      supplier: { select: { id: true, name: true, phone: true, address: true } },
      createdAt: true,
    },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.shop && req.user.resolvedShopId && user.shop.id !== req.user.resolvedShopId) {
    user.shop = await prisma.shop.findUnique({ where: { id: req.user.resolvedShopId }, select: { id: true, name: true, location: true, district: true, category: true, isCatalogPublished: true, hiddenMenuItems: true } });
  }
  if (user.shop) {
    const businessShopId = await getBillingShopIdForUser(req.user);
    const business = await prisma.shop.findUnique({ where: { id: businessShopId }, select: { allowVariableSalePrices: true } });
    user.shop.allowVariableSalePrices = business?.allowVariableSalePrices === true;
  }
  user.externalAi = await externalAiSettings(req.user);
  res.json({ settings: user });
});

const updateExternalAiConsent = asyncHandler(async (req, res) => {
  if (req.user.staffId || req.user.role !== "MERCHANT" || typeof req.body?.enabled !== "boolean") {
    return res.status(403).json({ error: "Only the primary business owner can manage external AI consent" });
  }
  const businessShopId = await getBillingShopIdForUser(req.user);
  const shop = businessShopId ? await prisma.shop.findUnique({ where: { id: businessShopId }, select: { id: true, userId: true, parentShopId: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true } }) : null;
  if (!shop || shop.userId !== req.user.userId || shop.parentShopId) return res.status(403).json({ error: "Only the primary business owner can manage external AI consent" });
  if (req.body.enabled && !canUseFeature(shop, "ASSISTANT")) return res.status(403).json({ error: "Ask DukaPilot AI requires an active assistant feature" });
  if (req.body.enabled && !cloudflareAi.isConfigured()) return res.status(503).json({ error: "External AI is not configured. The local assistant remains available." });
  const enabled = req.body.enabled;
  const updated = await prisma.shop.update({ where: { id: shop.id }, data: {
    externalAiEnabled: enabled,
    externalAiConsentAt: enabled ? new Date() : null,
    externalAiConsentVersion: enabled ? cloudflareAi.CONSENT_VERSION : null,
  }, select: { externalAiEnabled: true, externalAiConsentAt: true } });
  req.audit = { action: enabled ? "settings.external_ai.consent" : "settings.external_ai.revoke", resourceType: "shop", resourceId: shop.id, metadata: { enabled, consentVersion: enabled ? cloudflareAi.CONSENT_VERSION : null } };
  res.json({ externalAi: { ...updated, available: canUseFeature(shop, "ASSISTANT") && cloudflareAi.isConfigured(), enabled: updated.externalAiEnabled, canManage: true, dailyLimit: cloudflareAi.SHOP_DAILY_LIMIT } });
});

// PATCH /api/settings/shop — update shop details (merchant only)
const updateShop = asyncHandler(async (req, res) => {
  if (req.user.staffId || (req.user.role !== "MERCHANT" && req.user.role !== "ADMIN")) {
    return res.status(403).json({ error: "Only merchants can update shop settings" });
  }

  const shopId = await getShopIdForUser(req.user);
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return res.status(404).json({ error: "Shop not found" });

  const name = normalizeText(req.body.name);
  const location = normalizeText(req.body.location);
  const district = normalizeText(req.body.district);
  const category = normalizeText(req.body.category).toLowerCase();

  const data = {};
  if (name) data.name = name;
  if (location) data.location = location;
  if (district !== undefined) data.district = district || null;
  if (category) {
    if (!VALID_CATEGORIES.has(category)) {
      return res.status(400).json({ error: `Category must be one of: ${[...VALID_CATEGORIES].join(", ")}` });
    }
    data.category = category;
  }
  if (req.body.isCatalogPublished !== undefined) data.isCatalogPublished = Boolean(req.body.isCatalogPublished);

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  const updated = await prisma.shop.update({ where: { id: shop.id }, data });
  req.audit = { action: "settings.shop.update", resourceType: "shop", resourceId: shop.id, metadata: data };
  res.json({ shop: updated });
});

const updateMenuPreferences = asyncHandler(async (req, res) => {
  if (req.user.staffId || (req.user.role !== "MERCHANT" && req.user.role !== "ADMIN")) {
    return res.status(403).json({ error: "Only the business owner can change menu preferences" });
  }
  if (!Array.isArray(req.body.hiddenMenuItems) || req.body.hiddenMenuItems.length > HIDEABLE_MENU_ITEMS.size || req.body.hiddenMenuItems.some((item) => typeof item !== "string" || !HIDEABLE_MENU_ITEMS.has(item))) {
    return res.status(400).json({ error: "Choose valid optional menu items to hide" });
  }
  const shopId = await getShopIdForUser(req.user);
  const hiddenMenuItems = [...new Set(req.body.hiddenMenuItems)];
  await prisma.shop.update({ where: { id: shopId }, data: { hiddenMenuItems } });
  req.audit = { action: "settings.menu_preferences.update", resourceType: "shop", resourceId: shopId, metadata: { hiddenMenuItems } };
  res.json({ hiddenMenuItems });
});

const updateSalePricing = asyncHandler(async (req, res) => {
  if (req.user.staffId || (req.user.role !== "MERCHANT" && req.user.role !== "ADMIN")) {
    return res.status(403).json({ error: "Only the business owner can change checkout pricing" });
  }
  if (typeof req.body.allowVariableSalePrices !== "boolean") {
    return res.status(400).json({ error: "Choose whether sale price adjustments are allowed" });
  }
  const shopId = await getBillingShopIdForUser(req.user);
  const shop = await prisma.shop.update({ where: { id: shopId }, data: { allowVariableSalePrices: req.body.allowVariableSalePrices }, select: { id: true, allowVariableSalePrices: true } });
  req.audit = { action: "settings.sale_pricing.update", resourceType: "shop", resourceId: shopId, metadata: { allowVariableSalePrices: shop.allowVariableSalePrices } };
  res.json({ allowVariableSalePrices: shop.allowVariableSalePrices });
});

// PATCH /api/settings/language — update preferred language
const updateLanguage = asyncHandler(async (req, res) => {
  const language = normalizeText(req.body.language).toLowerCase();
  if (!VALID_LANGUAGES.has(language)) {
    return res.status(400).json({ error: "Language must be 'en' or 'sw'" });
  }
  if (req.user.staffId) {
    await prisma.staffMember.update({ where: { id: req.user.staffId }, data: { language } });
  } else {
    await prisma.user.update({ where: { id: req.user.userId }, data: { language } });
  }
  req.audit = { action: "settings.language.update", resourceType: req.user.staffId ? "staff" : "user", resourceId: req.user.staffId || req.user.userId, metadata: { language } };
  res.json({ message: "Language updated", language });
});

// PATCH /api/settings/pin — change own PIN (requires current PIN)
const changePin = asyncHandler(async (req, res) => {
  const currentPin = String(req.body.currentPin || "").trim();
  const newPin = String(req.body.newPin || "").trim();

  if (!currentPin || !newPin) {
    return res.status(400).json({ error: "currentPin and newPin are required" });
  }
  if (!/^\d{4,8}$/.test(newPin)) {
    return res.status(400).json({ error: "New PIN must be 4 to 8 digits" });
  }

  const account = req.user.staffId
    ? await prisma.staffMember.findFirst({ where: { id: req.user.staffId, isActive: true } })
    : await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!account || !account.pin) return res.status(404).json({ error: "Account not found" });

  const match = await bcrypt.compare(currentPin, account.pin);
  if (!match) return res.status(401).json({ error: "Current PIN is incorrect" });

  const hashedPin = await bcrypt.hash(newPin, 10);
  if (req.user.staffId) await prisma.staffMember.update({ where: { id: account.id }, data: { pin: hashedPin, sessionVersion: { increment: 1 } } });
  else await prisma.user.update({ where: { id: account.id }, data: { pin: hashedPin, sessionVersion: { increment: 1 } } });

  req.audit = { action: "settings.pin.change", resourceType: req.user.staffId ? "staff" : "user", resourceId: account.id };
  res.json({ message: "PIN changed successfully" });
});

// PATCH /api/settings/profile — update display name
const updateProfile = asyncHandler(async (req, res) => {
  const name = normalizeText(req.body.name);
  if (!name) return res.status(400).json({ error: "Name cannot be empty" });
  if (name.length > 100) return res.status(400).json({ error: "Name must be 100 characters or less" });

  const updateStartedAt = performance.now();
  if (req.user.staffId) await prisma.staffMember.update({ where: { id: req.user.staffId }, data: { name } });
  else await prisma.user.update({ where: { id: req.user.userId }, data: { name } });
  recordRequestPhase(req, "settings.profileUpdate", performance.now() - updateStartedAt);
  req.audit = { action: "settings.profile.update", resourceType: req.user.staffId ? "staff" : "user", resourceId: req.user.staffId || req.user.userId, metadata: { name } };
  res.json({ message: "Profile updated", name });
});

module.exports = { getSettings, updateShop, updateMenuPreferences, updateSalePricing, updateExternalAiConsent, updateLanguage, changePin, updateProfile };
