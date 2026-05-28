const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");

const VALID_CATEGORIES = new Set(["grocery", "pharmacy", "beauty", "bar", "hardware", "electronics", "clothing", "general"]);
const VALID_LANGUAGES = new Set(["en", "sw"]);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// GET /api/settings — return current user + shop/supplier profile
const getSettings = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: {
      id: true,
      phone: true,
      name: true,
      role: true,
      language: true,
      shop: { select: { id: true, name: true, location: true, district: true, category: true } },
      supplier: { select: { id: true, name: true, phone: true, address: true } },
      createdAt: true,
    },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ settings: user });
});

// PATCH /api/settings/shop — update shop details (merchant only)
const updateShop = asyncHandler(async (req, res) => {
  if (req.user.role !== "MERCHANT" && req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Only merchants can update shop settings" });
  }

  const shop = await prisma.shop.findUnique({ where: { userId: req.user.userId } });
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

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  const updated = await prisma.shop.update({ where: { id: shop.id }, data });
  req.audit = { action: "settings.shop.update", resourceType: "shop", resourceId: shop.id, metadata: data };
  res.json({ shop: updated });
});

// PATCH /api/settings/language — update preferred language
const updateLanguage = asyncHandler(async (req, res) => {
  const language = normalizeText(req.body.language).toLowerCase();
  if (!VALID_LANGUAGES.has(language)) {
    return res.status(400).json({ error: "Language must be 'en' or 'sw'" });
  }
  await prisma.user.update({ where: { id: req.user.userId }, data: { language } });
  req.audit = { action: "settings.language.update", resourceType: "user", resourceId: req.user.userId, metadata: { language } };
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

  const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const match = await bcrypt.compare(currentPin, user.pin);
  if (!match) return res.status(401).json({ error: "Current PIN is incorrect" });

  const hashedPin = await bcrypt.hash(newPin, 10);
  await prisma.user.update({ where: { id: user.id }, data: { pin: hashedPin } });

  req.audit = { action: "settings.pin.change", resourceType: "user", resourceId: user.id };
  res.json({ message: "PIN changed successfully" });
});

// PATCH /api/settings/profile — update display name
const updateProfile = asyncHandler(async (req, res) => {
  const name = normalizeText(req.body.name);
  if (!name) return res.status(400).json({ error: "Name cannot be empty" });
  if (name.length > 100) return res.status(400).json({ error: "Name must be 100 characters or less" });

  await prisma.user.update({ where: { id: req.user.userId }, data: { name } });
  req.audit = { action: "settings.profile.update", resourceType: "user", resourceId: req.user.userId, metadata: { name } };
  res.json({ message: "Profile updated", name });
});

module.exports = { getSettings, updateShop, updateLanguage, changePin, updateProfile };
