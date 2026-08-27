const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function normalizeStatus(value) {
  const status = String(value || "").toUpperCase();
  return ["OPEN", "OPENED", "COMPLETED", "DISMISSED"].includes(status) ? status : "OPEN";
}

function quotationDaysUntil(value) {
  if (!value) return null;
  const target = new Date(value); const today = new Date();
  target.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function quotationAction(type, quote, language) {
  const sw = language === "sw";
  const outstanding = Math.max(0, quote.totalAmount - quote.amountPaid);
  if (type === "CONVERT") return { id: `quotation-convert-${quote.id}`, rank: 93, href: "/quotations?status=ACCEPTED", title: sw ? `Badilisha ${quote.quotationNumber} kuwa mauzo` : `Convert ${quote.quotationNumber} to a sale`, body: sw ? `${quote.customer.name} amekubali ${quote.projectTitle}. Salio ni TZS ${outstanding.toLocaleString("en-TZ")}.` : `${quote.customer.name} accepted ${quote.projectTitle}. Outstanding: TZS ${outstanding.toLocaleString("en-TZ")}.`, action: sw ? "Fungua nukuu zilizokubaliwa" : "Open accepted quotations" };
  if (type === "DEPOSIT") return { id: `quotation-deposit-${quote.id}`, rank: quote.depositDueDate && quotationDaysUntil(quote.depositDueDate) < 0 ? 91 : 79, href: `/quotations?status=${quote.status}`, title: sw ? `Fuatilia amana ya ${quote.quotationNumber}` : `Follow up the deposit for ${quote.quotationNumber}`, body: sw ? `${quote.customer.name} bado anadaiwa TZS ${Math.max(0, quote.depositRequiredAmount - quote.amountPaid).toLocaleString("en-TZ")} ya amana.` : `${quote.customer.name} still owes TZS ${Math.max(0, quote.depositRequiredAmount - quote.amountPaid).toLocaleString("en-TZ")} of the deposit.`, action: sw ? "Fungua nukuu na rekodi malipo" : "Open quotation and record payment" };
  return { id: `quotation-expiring-${quote.id}`, rank: 84, href: "/quotations?status=SENT", title: sw ? `${quote.quotationNumber} inaisha hivi karibuni` : `${quote.quotationNumber} expires soon`, body: sw ? `Fuatilia ${quote.customer.name} kuhusu ${quote.projectTitle} kabla ya bei kuisha.` : `Follow up with ${quote.customer.name} about ${quote.projectTitle} before it expires.`, action: sw ? "Fungua nukuu zilizotumwa" : "Open sent quotations" };
}

const quotationSummary = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const language = req.user.language === "en" ? "en" : "sw";
  const quotations = await prisma.quotation.findMany({
    where: { shopId, status: { in: ["SENT", "ACCEPTED"] } },
    select: { id: true, quotationNumber: true, status: true, projectTitle: true, totalAmount: true, amountPaid: true, depositRequiredAmount: true, depositDueDate: true, expiryDate: true, customer: { select: { name: true } } },
    orderBy: { updatedAt: "desc" }, take: 200,
  });
  const actions = [];
  const accepted = quotations.filter((quote) => quote.status === "ACCEPTED").sort((a, b) => (b.totalAmount - b.amountPaid) - (a.totalAmount - a.amountPaid))[0];
  if (accepted) actions.push(quotationAction("CONVERT", accepted, language));
  const deposit = quotations.filter((quote) => quote.depositRequiredAmount > quote.amountPaid).sort((a, b) => Number(a.depositDueDate || a.expiryDate || 0) - Number(b.depositDueDate || b.expiryDate || 0))[0];
  if (deposit) actions.push(quotationAction("DEPOSIT", deposit, language));
  const expiring = quotations.filter((quote) => quote.status === "SENT" && quote.expiryDate && quotationDaysUntil(quote.expiryDate) >= 0 && quotationDaysUntil(quote.expiryDate) <= 3).sort((a, b) => Number(a.expiryDate) - Number(b.expiryDate))[0];
  if (expiring) actions.push(quotationAction("EXPIRING", expiring, language));
  res.json({ actions: actions.sort((a, b) => b.rank - a.rank), generatedAt: new Date().toISOString() });
});

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

module.exports = { listActions, trackAction, quotationSummary, adminAnalytics };
