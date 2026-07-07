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
      deviceLabel: String(req.body.deviceLabel || "").trim() || null,
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
    by: ["shopId", "deviceId", "deviceLabel", "status"],
    where,
    _count: { id: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: 200,
  });

  res.json({ events, devices });
});

function normalizeResolutionStatus(value) {
  const status = String(value || "").toUpperCase();
  return ["OPEN", "CONTACTED", "RESOLVED"].includes(status) ? status : null;
}

const adminUpdateEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const resolutionStatus = normalizeResolutionStatus(req.body.resolutionStatus);
  const resolutionNote = req.body.resolutionNote === undefined ? undefined : String(req.body.resolutionNote || "").trim() || null;

  if (!resolutionStatus && resolutionNote === undefined) {
    return res.status(400).json({ error: "resolutionStatus or resolutionNote is required" });
  }

  const updateData = {};
  if (resolutionStatus) {
    updateData.resolutionStatus = resolutionStatus;
    if (resolutionStatus === "CONTACTED") updateData.contactedAt = new Date();
    if (resolutionStatus === "RESOLVED") updateData.resolvedAt = new Date();
    if (resolutionStatus === "OPEN") {
      updateData.contactedAt = null;
      updateData.resolvedAt = null;
    }
  }
  if (resolutionNote !== undefined) updateData.resolutionNote = resolutionNote;

  const event = await prisma.offlineSyncEvent.update({
    where: { id: eventId },
    data: updateData,
    include: { shop: { select: { id: true, name: true, user: { select: { name: true, phone: true } } } } },
  });

  req.audit = {
    action: "offlineSync.resolution.updated",
    resourceType: "offline_sync",
    resourceId: event.id,
    metadata: { adminId: req.user.userId, resolutionStatus, resolutionNote },
  };

  res.json({ event });
});

const adminUpdateDeviceLabel = asyncHandler(async (req, res) => {
  const shopId = String(req.body.shopId || "").trim();
  const deviceId = String(req.body.deviceId || "").trim();
  const deviceLabel = String(req.body.deviceLabel || "").trim();

  if (!shopId || !deviceId || !deviceLabel) {
    return res.status(400).json({ error: "shopId, deviceId, and deviceLabel are required" });
  }

  const result = await prisma.offlineSyncEvent.updateMany({
    where: { shopId, deviceId },
    data: { deviceLabel },
  });

  req.audit = {
    action: "offlineSync.deviceLabel.updated",
    resourceType: "offline_sync_device",
    resourceId: deviceId,
    metadata: { adminId: req.user.userId, shopId, deviceId, deviceLabel, count: result.count },
  };

  res.json({ message: "Device label updated", count: result.count, shopId, deviceId, deviceLabel });
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
      deviceLabel: true,
      resolutionStatus: true,
      resolutionNote: true,
      contactedAt: true,
      resolvedAt: true,
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

module.exports = { createEvent, myEvents, adminEvents, adminUpdateEvent, adminUpdateDeviceLabel, adminSummary };
