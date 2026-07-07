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

module.exports = { listActions, trackAction };
