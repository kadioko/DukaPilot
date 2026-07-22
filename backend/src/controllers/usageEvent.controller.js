const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");

const ACTION_ROUTES = { sale: "/sales", inventory: "/inventory", debts: "/debts" };
function asyncHandler(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }

const create = asyncHandler(async (req, res) => {
  const { eventName, action, route, deviceId } = req.body || {};
  if (eventName !== "android_shortcut_opened" || !Object.hasOwn(ACTION_ROUTES, action) || ACTION_ROUTES[action] !== route || typeof deviceId !== "string" || deviceId.length < 8 || deviceId.length > 120) {
    return res.status(400).json({ error: "Invalid usage event" });
  }
  const shopId = await getShopIdForUser(req.user);
  const recent = await prisma.appUsageEvent.findFirst({ where: { shopId, deviceId, eventName, action, createdAt: { gte: new Date(Date.now() - 60 * 1000) } }, select: { id: true } });
  if (recent) return res.status(202).json({ message: "Usage event already recorded" });
  await prisma.appUsageEvent.create({ data: { shopId, deviceId, eventName, action, route, userId: req.user.userId || null, staffId: req.user.staffId || null } });
  res.status(201).json({ message: "Usage event recorded" });
});

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const events = await prisma.appUsageEvent.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, action: true, route: true, deviceId: true, createdAt: true } });
  res.json({ events });
});

module.exports = { create, list };
