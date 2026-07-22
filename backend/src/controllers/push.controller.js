const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { configured, processPushDeliveries } = require("../services/push.service");

function asyncHandler(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
function cleanText(value, max) { return String(value || "").trim().slice(0, max); }

const config = asyncHandler(async (_req, res) => {
  res.json({ enabled: configured(), publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

const getPreferences = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const preferences = await prisma.notificationPreference.upsert({ where: { shopId }, update: {}, create: { shopId } });
  const subscriptions = await prisma.pushSubscription.findMany({ where: { shopId }, select: { id: true, deviceId: true, deviceLabel: true, isActive: true, lastSeenAt: true } });
  res.json({ preferences, subscriptions, pushConfigured: configured() });
});

const updatePreferences = asyncHandler(async (req, res) => {
  if (req.user.staffId) return res.status(403).json({ error: "Only the shop owner can change alert preferences" });
  const shopId = await getShopIdForUser(req.user);
  const data = {};
  for (const key of ["lowStock", "debtDue", "subscriptionExpiry", "dailyAssistant"]) {
    if (typeof req.body[key] === "boolean") data[key] = req.body[key];
  }
  const preferences = await prisma.notificationPreference.upsert({ where: { shopId }, update: data, create: { shopId, ...data } });
  res.json({ preferences });
});

const subscribe = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const endpoint = cleanText(req.body.endpoint, 2048);
  const p256dh = cleanText(req.body.keys?.p256dh, 512);
  const auth = cleanText(req.body.keys?.auth, 512);
  const deviceId = cleanText(req.body.deviceId, 120);
  const deviceLabel = cleanText(req.body.deviceLabel, 120) || null;
  if (!endpoint.startsWith("https://") || !p256dh || !auth || !deviceId) return res.status(400).json({ error: "A valid device subscription is required" });

  // A browser endpoint belongs to the currently signed-in shop on this device.
  // Deactivate any older tenant binding before saving the new subscription.
  await prisma.pushSubscription.updateMany({ where: { endpoint, shopId: { not: shopId } }, data: { isActive: false } });
  await prisma.pushSubscription.upsert({
    where: { shopId_deviceId: { shopId, deviceId } },
    update: { endpoint, p256dh, auth, deviceLabel, userId: req.user.userId || null, staffId: req.user.staffId || null, isActive: true, failureCount: 0, lastSeenAt: new Date() },
    create: { shopId, endpoint, p256dh, auth, deviceId, deviceLabel, userId: req.user.userId || null, staffId: req.user.staffId || null },
  });
  res.status(201).json({ message: "Device alerts enabled" });
});

const unsubscribe = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const deviceId = cleanText(req.body.deviceId, 120);
  if (!deviceId) return res.status(400).json({ error: "deviceId is required" });
  await prisma.pushSubscription.updateMany({ where: { shopId, deviceId }, data: { isActive: false } });
  res.json({ message: "Device alerts disabled" });
});

const listDeliveries = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const deliveries = await prisma.pushDelivery.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 100, include: { subscription: { select: { deviceLabel: true, deviceId: true } } } });
  res.json({ deliveries });
});

const process = asyncHandler(async (_req, res) => {
  const result = await processPushDeliveries();
  res.json(result);
});

module.exports = { config, getPreferences, updatePreferences, subscribe, unsubscribe, listDeliveries, process };
