const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function normalizeStatus(value) {
  const status = String(value || "").toUpperCase();
  return ["QUEUED", "SYNCED", "FAILED", "REMOVED"].includes(status) ? status : "FAILED";
}

const createEvent = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const event = await prisma.offlineSyncEvent.create({
    data: {
      shopId,
      deviceId: String(req.body.deviceId || "").trim() || null,
      status: normalizeStatus(req.body.status),
      total: req.body.total == null ? null : Number(req.body.total),
      message: String(req.body.message || "").trim() || null,
      attempts: Math.max(0, Number(req.body.attempts) || 0),
      localId: String(req.body.localId || "").trim() || null,
    },
  });
  req.audit = { action: "offlineSync.event", resourceType: "offline_sync", resourceId: event.id, metadata: { status: event.status } };
  res.status(201).json({ event });
});

const myEvents = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const events = await prisma.offlineSyncEvent.findMany({
    where: { shopId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  res.json({ events });
});

const adminEvents = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const shopId = String(req.query.shopId || "").trim();
  const deviceId = String(req.query.deviceId || "").trim();
  const status = String(req.query.status || "").trim().toUpperCase();
  const where = {};
  if (shopId) where.shopId = shopId;
  if (deviceId) where.deviceId = deviceId;
  if (["QUEUED", "SYNCED", "FAILED", "REMOVED"].includes(status)) where.status = status;

  const events = await prisma.offlineSyncEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      shop: { select: { id: true, name: true, user: { select: { name: true, phone: true } } } },
    },
  });

  const devices = await prisma.offlineSyncEvent.groupBy({
    by: ["shopId", "deviceId", "status"],
    where,
    _count: { id: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: 200,
  });

  res.json({ events, devices });
});

const adminSummary = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await prisma.offlineSyncEvent.groupBy({
    by: ["shopId", "status"],
    where: { createdAt: { gte: since } },
    _count: { id: true },
    _max: { createdAt: true },
  });
  const recentFailures = await prisma.offlineSyncEvent.findMany({
    where: { createdAt: { gte: since }, status: "FAILED" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      shopId: true,
      deviceId: true,
      total: true,
      message: true,
      attempts: true,
      localId: true,
      createdAt: true,
    },
  });
  const shops = await prisma.shop.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.shopId))] } },
    select: { id: true, name: true, user: { select: { name: true, phone: true } } },
  });
  const shopMap = new Map(shops.map((shop) => [shop.id, shop]));
  const summaryByShop = new Map();
  for (const row of rows) {
    const current = summaryByShop.get(row.shopId) || {
      shop: shopMap.get(row.shopId),
      queued: 0,
      synced: 0,
      failed: 0,
      removed: 0,
      lastEventAt: null,
      recentFailures: [],
    };
    current[row.status.toLowerCase()] = row._count.id;
    if (!current.lastEventAt || row._max.createdAt > current.lastEventAt) current.lastEventAt = row._max.createdAt;
    summaryByShop.set(row.shopId, current);
  }
  for (const event of recentFailures) {
    const current = summaryByShop.get(event.shopId);
    if (!current) continue;
    current.recentFailures.push(event);
  }
  res.json({ shops: [...summaryByShop.values()].filter((item) => item.shop).sort((a, b) => b.failed - a.failed || new Date(b.lastEventAt) - new Date(a.lastEventAt)) });
});

module.exports = { createEvent, myEvents, adminEvents, adminSummary };
