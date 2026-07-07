const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function normalizeStatus(value) {
  const status = String(value || "").toUpperCase();
  return ["OPEN", "OPENED", "COMPLETED", "DISMISSED"].includes(status) ? status : "OPEN";
}

const listActions = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const actions = await prisma.assistantAction.findMany({
    where: { shopId },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  res.json({ actions });
});

const trackAction = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const actionKey = String(req.body.actionKey || "").trim();
  const title = String(req.body.title || "").trim();
  const href = String(req.body.href || "").trim();
  const status = normalizeStatus(req.body.status);

  if (!actionKey || !title || !href) {
    return res.status(400).json({ error: "actionKey, title, and href are required" });
  }

  const now = new Date();
  const action = await prisma.assistantAction.upsert({
    where: { shopId_actionKey: { shopId, actionKey } },
    create: {
      shopId,
      actionKey,
      title,
      href,
      status,
      openedAt: status === "OPENED" ? now : null,
      completedAt: status === "COMPLETED" ? now : null,
      dismissedAt: status === "DISMISSED" ? now : null,
    },
    update: {
      title,
      href,
      status,
      openedAt: status === "OPENED" ? now : undefined,
      completedAt: status === "COMPLETED" ? now : undefined,
      dismissedAt: status === "DISMISSED" ? now : undefined,
    },
  });

  req.audit = {
    action: `assistant.action.${status.toLowerCase()}`,
    resourceType: "assistant_action",
    resourceId: action.id,
    metadata: { shopId, actionKey, href },
  };

  res.status(201).json({ action });
});

const adminAnalytics = asyncHandler(async (req, res) => {
  const sinceDays = Math.max(1, Math.min(365, Number(req.query.days) || 30));
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const [total, statusRows, topRows, recentActions] = await Promise.all([
    prisma.assistantAction.count({ where: { updatedAt: { gte: since } } }),
    prisma.assistantAction.groupBy({
      by: ["status"],
      where: { updatedAt: { gte: since } },
      _count: { id: true },
    }),
    prisma.assistantAction.groupBy({
      by: ["actionKey"],
      where: { updatedAt: { gte: since } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 8,
    }),
    prisma.assistantAction.findMany({
      where: { updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: { shop: { select: { id: true, name: true, user: { select: { name: true, phone: true } } } } },
    }),
  ]);

  const statusCounts = Object.fromEntries(statusRows.map((row) => [row.status, row._count.id]));
  const topActionKeys = topRows.map((row) => row.actionKey);
  const actionLabels = topActionKeys.length
    ? await prisma.assistantAction.findMany({
        where: { actionKey: { in: topActionKeys } },
        distinct: ["actionKey"],
        select: { actionKey: true, title: true, href: true },
      })
    : [];
  const labelMap = new Map(actionLabels.map((action) => [action.actionKey, action]));

  res.json({
    days: sinceDays,
    summary: {
      total,
      open: statusCounts.OPEN || 0,
      opened: statusCounts.OPENED || 0,
      completed: statusCounts.COMPLETED || 0,
      dismissed: statusCounts.DISMISSED || 0,
      completedRate: total ? Math.round(((statusCounts.COMPLETED || 0) / total) * 100) : 0,
      dismissedRate: total ? Math.round(((statusCounts.DISMISSED || 0) / total) * 100) : 0,
      openedRate: total ? Math.round(((statusCounts.OPENED || 0) / total) * 100) : 0,
    },
    topActions: topRows.map((row) => ({
      actionKey: row.actionKey,
      count: row._count.id,
      title: labelMap.get(row.actionKey)?.title || row.actionKey,
      href: labelMap.get(row.actionKey)?.href || "",
    })),
    recentActions,
  });
});

module.exports = { listActions, trackAction, adminAnalytics };
