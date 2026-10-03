const prisma = require("../lib/prisma");
const { subscriptionSnapshot, subscriptionStatusWhere } = require("./subscription.controller");

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const openReport = { status: { in: ["OPEN", "IN_PROGRESS"] } };

function actionWhere(now) {
  return {
    OR: [
      { isActive: false },
      { onboardingStatus: { in: ["NEEDS_HELP", "CHURN_RISK"] } },
      { nextFollowUpAt: { lte: now } },
      { user: { reports: { some: openReport } } },
      { isActive: true, plan: "FREE_TRIAL", trialEndsAt: { lte: new Date(now.getTime() + 3 * 86400000) } },
      subscriptionStatusWhere("expired", now),
    ],
  };
}

const operationsSummary = wrap(async (_req, res) => {
  const now = new Date();
  const since24h = new Date(now.getTime() - 86400000);
  const since7d = new Date(now.getTime() - 7 * 86400000);
  const [openReports, billingReports, urgentReports, qualifiedReferrals, supplierReview, loginFailures24h, loginFailures7d, shopsNeedingAction, dueFollowUps, reviewCheckouts, recentNotes, latestAdminAction, paymentReviewQueue] = await Promise.all([
    prisma.report.count({ where: openReport }),
    prisma.report.count({ where: { ...openReport, type: "BILLING" } }),
    prisma.report.count({ where: { ...openReport, priority: { in: ["HIGH", "URGENT"] } } }),
    prisma.shopReferral.count({ where: { status: "QUALIFIED" } }),
    prisma.supplier.count({ where: { verificationStatus: { not: "VERIFIED" } } }),
    prisma.loginFailureEvent.count({ where: { createdAt: { gte: since24h } } }),
    prisma.loginFailureEvent.count({ where: { createdAt: { gte: since7d } } }),
    prisma.shop.count({ where: { parentShopId: null, ...actionWhere(now) } }),
    prisma.shop.count({ where: { parentShopId: null, nextFollowUpAt: { lte: now } } }),
    prisma.subscriptionCheckout.count({ where: { status: "REVIEW" } }),
    prisma.shopSupportNote.findMany({ select: { id: true, body: true, createdAt: true, shop: { select: { id: true, name: true } }, author: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 4 }),
    prisma.auditLog.findFirst({ where: { action: { startsWith: "admin." } }, select: { id: true, action: true, method: true, path: true, createdAt: true, user: { select: { id: true, name: true, phone: true, role: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.report.findMany({ where: { ...openReport, type: "BILLING" }, orderBy: { createdAt: "desc" }, take: 4, include: { user: { select: { id: true, name: true, phone: true, role: true, shop: { select: { id: true, name: true } } } } } }),
  ]);
  res.json({ openReports, billingReports, urgentReports, qualifiedReferrals, supplierReview, loginFailures24h, loginFailures7d, shopsNeedingAction, dueFollowUps, reviewCheckouts, recentNotes, latestAdminAction, paymentReviewQueue });
});

const listShops = wrap(async (req, res) => {
  const now = new Date();
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const limit = Math.max(10, Math.min(50, Number.parseInt(req.query.limit, 10) || 20));
  const search = String(req.query.search || "").trim().slice(0, 100);
  const filter = req.query.filter === "all" ? "all" : "action";
  const where = { parentShopId: null, ...(filter === "action" ? actionWhere(now) : {}) };
  if (search) {
    where.AND = [{ OR: [
      { name: { contains: search, mode: "insensitive" } },
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { phone: { contains: search, mode: "insensitive" } } },
    ] }];
  }
  const [total, shops] = await Promise.all([
    prisma.shop.count({ where }),
    prisma.shop.findMany({
      where,
      select: {
        id: true, name: true, location: true, plan: true, isActive: true, trialEndsAt: true, subscriptionEndsAt: true,
        onboardingStatus: true, lastContactedAt: true, nextFollowUpAt: true, createdAt: true,
        user: { select: { id: true, name: true, phone: true } },
        supportAssignee: { select: { id: true, name: true } },
        _count: { select: { branches: true } },
      },
      orderBy: [{ lastContactedAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  res.json({ shops: shops.map((shop) => ({ ...shop, ...subscriptionSnapshot(shop, now) })), total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

const shopDetail = wrap(async (req, res) => {
  const shop = await prisma.shop.findFirst({
    where: { id: req.params.shopId, parentShopId: null },
    select: {
      id: true, name: true, location: true, plan: true, isActive: true, trialEndsAt: true, subscriptionEndsAt: true,
      userId: true, onboardingStatus: true, lastContactedAt: true, nextFollowUpAt: true, followUpNotes: true, createdAt: true,
      supportAssigneeId: true, supportAssignee: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, phone: true } },
      branches: { select: { id: true, name: true, location: true, branchArchived: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!shop) return res.status(404).json({ error: "Shop not found" });
  const shopIds = [shop.id, ...shop.branches.map((branch) => branch.id)];
  const notePage = Math.max(1, Math.min(100000, Number.parseInt(req.query.notePage, 10) || 1));
  const [payments, reports, syncFailures, sales, notes, noteCount, latestAdminAction] = await Promise.all([
    prisma.subscriptionPayment.findMany({ where: { shopId: shop.id }, select: { id: true, plan: true, amount: true, method: true, reference: true, status: true, paidAt: true, months: true, reviewedBy: true }, orderBy: { paidAt: "desc" }, take: 20 }),
    shop.userId ? prisma.report.findMany({ where: { userId: shop.userId }, select: { id: true, title: true, type: true, status: true, priority: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 }) : [],
    prisma.offlineSyncEvent.findMany({ where: { shopId: { in: shopIds }, status: "FAILED", resolutionStatus: { not: "RESOLVED" } }, select: { id: true, shopId: true, deviceLabel: true, operationKind: true, attempts: true, createdAt: true, resolutionStatus: true }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.sale.aggregate({ where: { shopId: { in: shopIds }, status: "COMPLETED" }, _count: { id: true }, _max: { createdAt: true } }),
    prisma.shopSupportNote.findMany({ where: { shopId: shop.id }, select: { id: true, body: true, createdAt: true, author: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, skip: (notePage - 1) * 20, take: 20 }),
    prisma.shopSupportNote.count({ where: { shopId: shop.id } }),
    prisma.auditLog.findFirst({ where: { resourceId: shop.id, action: { startsWith: "admin." } }, select: { action: true, createdAt: true, user: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
  ]);
  res.json({ shop: { ...shop, ...subscriptionSnapshot(shop) }, payments, reports, syncFailures, sales: { count: sales._count.id, lastAt: sales._max.createdAt }, notes, noteCount, notePage, latestAdminAction });
});

const addNote = wrap(async (req, res) => {
  const body = String(req.body.body || "").trim();
  if (!body || body.length > 2000) return res.status(400).json({ error: "Note must be 1 to 2000 characters" });
  const shop = await prisma.shop.findFirst({ where: { id: req.params.shopId, parentShopId: null }, select: { id: true } });
  if (!shop) return res.status(404).json({ error: "Shop not found" });
  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.shopSupportNote.create({ data: { shopId: shop.id, authorId: req.user.userId, body }, select: { id: true, body: true, createdAt: true } });
    await tx.shop.update({ where: { id: shop.id }, data: { followUpNotes: body } });
    return created;
  });
  req.audit = { action: "admin.support.noteAdded", resourceType: "shop", resourceId: shop.id, metadata: { noteId: note.id } };
  res.status(201).json({ note });
});

const updateShopSupport = wrap(async (req, res) => {
  const data = {};
  if (req.body.supportAssigneeId !== undefined) {
    const id = req.body.supportAssigneeId || null;
    if (id) {
      const assignee = await prisma.user.findFirst({ where: { id, role: "ADMIN" }, select: { id: true } });
      if (!assignee) return res.status(400).json({ error: "Choose an admin account" });
    }
    data.supportAssigneeId = id;
  }
  if (req.body.nextFollowUpAt !== undefined) {
    const value = req.body.nextFollowUpAt;
    const date = value ? new Date(value) : null;
    if (date && Number.isNaN(date.getTime())) return res.status(400).json({ error: "Invalid follow-up date" });
    data.nextFollowUpAt = date;
  }
  if (req.body.onboardingStatus !== undefined) {
    if (!["NEW", "CONTACTED", "NEEDS_HELP", "SETUP_DONE", "ACTIVATED", "PAID", "CONVERTED", "CHURN_RISK"].includes(req.body.onboardingStatus)) return res.status(400).json({ error: "Invalid support status" });
    data.onboardingStatus = req.body.onboardingStatus;
  }
  if (req.body.contacted === true) data.lastContactedAt = new Date();
  if (!Object.keys(data).length) return res.status(400).json({ error: "No support changes provided" });
  const changed = await prisma.shop.updateMany({ where: { id: req.params.shopId, parentShopId: null }, data });
  if (!changed.count) return res.status(404).json({ error: "Shop not found" });
  req.audit = { action: "admin.support.updated", resourceType: "shop", resourceId: req.params.shopId, metadata: { fields: Object.keys(data) } };
  res.json({ message: "Support details saved" });
});

const listAdmins = wrap(async (_req, res) => {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  res.json({ admins });
});

module.exports = { operationsSummary, listShops, shopDetail, addNote, updateShopSupport, listAdmins };
