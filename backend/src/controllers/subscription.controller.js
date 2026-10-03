const prisma = require("../lib/prisma");
const { isSubscriptionActive } = require("../middleware/subscription");
const { getBillingShopIdForUser: getShopIdForUser } = require("../lib/shopAccess");
const { priceSubscription, validateBranchCapacity } = require("../lib/subscriptionPricing");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function reminderStage(status, daysLeft) {
  if (status === "expired") return "EXPIRED";
  if (status === "suspended") return "SUSPENDED";
  if (daysLeft === null || daysLeft === undefined) return null;
  if (daysLeft <= 1) return "DUE_1_DAY";
  if (daysLeft <= 3) return "DUE_3_DAYS";
  if (daysLeft <= 7) return "DUE_7_DAYS";
  return null;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function addMonthsClamped(date, months) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function parseOptionalDate(value, field) {
  if (value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw Object.assign(new Error(`${field} must be a valid date`), { status: 400 });
  return date;
}

function normalizePaymentReference(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function subscriptionSnapshot(shop, now = new Date()) {
  const trialActive = shop.plan === "FREE_TRIAL" && shop.trialEndsAt && shop.trialEndsAt > now;
  const subActive = shop.subscriptionEndsAt && shop.subscriptionEndsAt > now;
  const status = !shop.isActive ? "suspended" : trialActive ? "trial" : subActive ? "active" : "expired";
  const validUntil = status === "trial" ? shop.trialEndsAt : status === "active" ? shop.subscriptionEndsAt : shop.subscriptionEndsAt || shop.trialEndsAt || null;
  const daysLeft = validUntil ? Math.max(0, Math.ceil((validUntil - now) / (1000 * 60 * 60 * 24))) : null;
  return {
    trialActive,
    subActive,
    status,
    computedStatus: status,
    validUntil,
    daysLeft,
    reminderStage: reminderStage(status, daysLeft),
  };
}

function subscriptionStatusWhere(status, now) {
  if (status === "trial") return { isActive: true, plan: "FREE_TRIAL", trialEndsAt: { gt: now } };
  if (status === "active") return { isActive: true, subscriptionEndsAt: { gt: now } };
  if (status === "suspended") return { isActive: false };
  if (status === "expired") {
    return {
      isActive: true,
      NOT: {
        OR: [
          { plan: "FREE_TRIAL", trialEndsAt: { gt: now } },
          { subscriptionEndsAt: { gt: now } },
        ],
      },
    };
  }
  return null;
}

function withSubscriptionStatus(baseWhere, status, now) {
  const statusWhere = subscriptionStatusWhere(status, now);
  return statusWhere ? { AND: [baseWhere, statusWhere] } : baseWhere;
}

// Get current shop's subscription status
const getStatus = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true, createdAt: true, additionalBranchSlots: true },
  });
  if (!shop) return res.status(404).json({ error: "Shop not found" });

  const snapshot = subscriptionSnapshot(shop);
  const activeBranchCount = await prisma.shop.count({ where: { parentShopId: shopId, branchArchived: false } });

  res.json({
    activeBranchCount,
    extraBranches: shop.additionalBranchSlots,
    monthlyAmount: shop.plan === "PRO" ? 35000 + 10000 * shop.additionalBranchSlots : 15000,
    plan: shop.plan,
    isActive: shop.isActive,
    trialEndsAt: shop.trialEndsAt,
    subscriptionEndsAt: shop.subscriptionEndsAt,
    trialActive: snapshot.trialActive,
    subActive: snapshot.subActive,
    validUntil: snapshot.validUntil,
    daysLeft: snapshot.daysLeft,
    status: snapshot.status,
    reminderStage: snapshot.reminderStage,
  });
});

// Admin: list all subscriptions
const adminListSubscriptions = asyncHandler(async (req, res) => {
  const plan = String(req.query.plan || "").toUpperCase();
  const status = String(req.query.status || "").toLowerCase();
  const search = String(req.query.search || "").trim().slice(0, 120);
  const limit = Math.max(10, Math.min(100, Number(req.query.limit) || 24));
  const requestedPage = Math.max(1, Number(req.query.page) || 1);
  const now = new Date();

  const baseWhere = { parentShopId: null };
  if (["FREE_TRIAL", "BASIC", "PRO"].includes(plan)) baseWhere.plan = plan;
  if (search) {
    baseWhere.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { phone: { contains: search, mode: "insensitive" } } },
    ];
  }

  const selectedStatus = ["trial", "active", "expired", "suspended"].includes(status) ? status : null;
  const pageWhere = withSubscriptionStatus(baseWhere, selectedStatus, now);
  const statusNames = ["trial", "active", "expired", "suspended"];
  const [total, expiringTrials, stalledTrials, activatedTrials, ...statusCounts] = await Promise.all([
    prisma.shop.count({ where: pageWhere }),
    prisma.shop.count({ where: { parentShopId: null, isActive: true, plan: "FREE_TRIAL", trialEndsAt: { gt: now, lte: new Date(now.getTime() + 3 * 86400000) } } }),
    prisma.shop.count({ where: { parentShopId: null, isActive: true, plan: "FREE_TRIAL", trialEndsAt: { gt: now }, onboardingStatus: { in: ["NEW", "CONTACTED", "NEEDS_HELP"] } } }),
    prisma.shop.count({ where: { parentShopId: null, isActive: true, plan: "FREE_TRIAL", trialEndsAt: { gt: now }, onboardingStatus: { in: ["SETUP_DONE", "ACTIVATED", "PAID", "CONVERTED"] } } }),
    ...statusNames.map((name) => prisma.shop.count({ where: withSubscriptionStatus(baseWhere, name, now) })),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(requestedPage, totalPages);

  const shops = await prisma.shop.findMany({
    where: pageWhere,
    select: {
      id: true,
      name: true,
      plan: true,
      trialEndsAt: true,
      subscriptionEndsAt: true,
      isActive: true,
      onboardingStatus: true,
      additionalBranchSlots: true,
      lastContactedAt: true,
      followUpNotes: true,
      createdAt: true,
      user: { select: { id: true, name: true, phone: true } },
      subscriptionPayments: { orderBy: { paidAt: "desc" }, take: 1 },
      _count: {
        select: {
          products: { where: { isActive: true } },
          sales: { where: { status: "COMPLETED" } },
          orders: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: (page - 1) * limit,
  });

  const supportShops = await prisma.shop.findMany({
    where: {
      parentShopId: null,
      OR: [
        { isActive: false },
        { onboardingStatus: { in: ["NEEDS_HELP", "CHURN_RISK"] } },
        { isActive: true, plan: "FREE_TRIAL", trialEndsAt: { lte: new Date(now.getTime() + 3 * 86400000) } },
        { AND: [subscriptionStatusWhere("expired", now)] },
      ],
    },
    select: {
      id: true, name: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true,
      onboardingStatus: true, additionalBranchSlots: true, lastContactedAt: true, followUpNotes: true, createdAt: true,
      user: { select: { id: true, name: true, phone: true } },
      subscriptionPayments: { orderBy: { paidAt: "desc" }, take: 1 },
      _count: { select: { products: { where: { isActive: true } }, sales: { where: { status: "COMPLETED" } }, orders: true } },
    },
    orderBy: { updatedAt: "asc" },
    take: 60,
  });

  const shopIds = Array.from(new Set([...shops, ...supportShops].map((s) => s.id)));
  const secondDaySaleRows = shopIds.length
    ? await prisma.sale.groupBy({
        by: ["shopId"],
        where: {
          shopId: { in: shopIds },
          status: "COMPLETED",
        },
        _min: { createdAt: true },
        _max: { createdAt: true },
      })
    : [];
  const saleSpanByShop = new Map(secondDaySaleRows.map((row) => [row.shopId, row]));

  // Compute status for each
  const enrichShop = (s) => {
    const snapshot = subscriptionSnapshot(s, now);
    const saleSpan = saleSpanByShop.get(s.id);
    const firstSaleAt = saleSpan?._min.createdAt || null;
    const lastSaleAt = saleSpan?._max.createdAt || null;
    const secondDayReturn = Boolean(firstSaleAt && lastSaleAt && lastSaleAt.getTime() - firstSaleAt.getTime() >= 24 * 60 * 60 * 1000);
    const activation = {
      productCount: s._count.products,
      salesCount: s._count.sales,
      orderCount: s._count.orders,
      secondDayReturn,
      activated: s._count.products >= 10 && s._count.sales >= 10 && secondDayReturn,
    };
    return { ...s, ...snapshot, lastPayment: s.subscriptionPayments[0] || null, activation };
  };
  const enriched = shops.map(enrichShop);
  const supportQueue = supportShops.map(enrichShop);

  res.json({
    shops: enriched,
    total,
    page,
    limit,
    totalPages,
    statusCounts: Object.fromEntries(statusNames.map((name, index) => [name, statusCounts[index]])),
    operationalCounts: { expiringTrials, stalledTrials, activatedTrials },
    supportQueue,
  });
});

// Admin: update a shop's subscription
const adminUpdateSubscription = asyncHandler(async (req, res) => {
  const { shopId } = req.params;
  const { plan, trialEndsAt, subscriptionEndsAt, isActive, onboardingStatus, lastContactedAt, followUpNotes } = req.body;

  const updateData = {};
  if (plan) {
    const nextPlan = String(plan).toUpperCase();
    if (!["FREE_TRIAL", "BASIC", "PRO"].includes(nextPlan)) return res.status(400).json({ error: "Invalid subscription plan" });
    if (nextPlan === "BASIC") await validateBranchCapacity(prisma, shopId, nextPlan, 0);
    updateData.plan = nextPlan;
  }
  if (trialEndsAt !== undefined) updateData.trialEndsAt = parseOptionalDate(trialEndsAt, "trialEndsAt");
  if (subscriptionEndsAt !== undefined) updateData.subscriptionEndsAt = parseOptionalDate(subscriptionEndsAt, "subscriptionEndsAt");
  if (isActive !== undefined) updateData.isActive = Boolean(isActive);
  if (onboardingStatus !== undefined) {
    const nextStatus = String(onboardingStatus).toUpperCase();
    if (!["NEW", "CONTACTED", "NEEDS_HELP", "SETUP_DONE", "ACTIVATED", "PAID", "CONVERTED", "CHURN_RISK"].includes(nextStatus)) {
      return res.status(400).json({ error: "Invalid onboarding status" });
    }
    updateData.onboardingStatus = nextStatus;
  }
  if (lastContactedAt !== undefined) updateData.lastContactedAt = parseOptionalDate(lastContactedAt, "lastContactedAt");
  if (followUpNotes !== undefined) updateData.followUpNotes = String(followUpNotes || "").trim() || null;

  const select = {
      id: true,
      name: true,
      plan: true,
      trialEndsAt: true,
      subscriptionEndsAt: true,
      isActive: true,
      onboardingStatus: true,
      lastContactedAt: true,
      followUpNotes: true,
    };
  const note = typeof updateData.followUpNotes === "string" ? updateData.followUpNotes : null;
  if (note && note.length > 2000) return res.status(400).json({ error: "Support note must be at most 2000 characters" });
  const shop = note ? await prisma.$transaction(async (tx) => {
    const updated = await tx.shop.update({ where: { id: shopId }, data: updateData, select });
    await tx.shopSupportNote.create({ data: { shopId, authorId: req.user.userId, body: note } });
    return updated;
  }) : await prisma.shop.update({ where: { id: shopId }, data: updateData, select });

  const auditChanges = { ...updateData };
  delete auditChanges.followUpNotes;
  req.audit = {
    action: "admin.subscription.updated",
    resourceType: "shop",
    resourceId: shopId,
    metadata: { adminId: req.user.userId, changes: auditChanges, noteSaved: Boolean(note) },
  };

  res.json({ shop });
});

// Admin: extend trial by N days
const adminExtendTrial = asyncHandler(async (req, res) => {
  const { shopId } = req.params;
  const days = Math.max(1, Math.min(90, Number(req.body.days) || 7));

  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { trialEndsAt: true } });
  if (!shop) return res.status(404).json({ error: "Shop not found" });

  const base = shop.trialEndsAt && shop.trialEndsAt > new Date() ? shop.trialEndsAt : new Date();
  const newDate = addDays(base, days);

  const updated = await prisma.shop.update({
    where: { id: shopId },
    data: { trialEndsAt: newDate, plan: "FREE_TRIAL", isActive: true },
    select: { id: true, name: true, plan: true, trialEndsAt: true },
  });

  res.json({ shop: updated, message: `Trial extended by ${days} days` });
});

const adminExtendSubscription = asyncHandler(async (req, res) => {
  const { shopId } = req.params;
  const days = Math.max(1, Math.min(730, Number(req.body.days) || 30));
  const plan = req.body.plan ? String(req.body.plan).toUpperCase() : undefined;

  if (plan && !["BASIC", "PRO"].includes(plan)) return res.status(400).json({ error: "Plan must be BASIC or PRO" });

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, name: true, plan: true, subscriptionEndsAt: true },
  });
  if (!shop) return res.status(404).json({ error: "Shop not found" });

  const now = new Date();
  const base = shop.subscriptionEndsAt && shop.subscriptionEndsAt > now ? shop.subscriptionEndsAt : now;
  const subscriptionEndsAt = addDays(base, days);
  const nextPlan = plan || (shop.plan === "PRO" ? "PRO" : "BASIC");

  const updated = await prisma.shop.update({
    where: { id: shopId },
    data: { plan: nextPlan, subscriptionEndsAt, isActive: true },
    select: { id: true, name: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true },
  });

  req.audit = {
    action: "admin.subscription.extended",
    resourceType: "shop",
    resourceId: shopId,
    metadata: { adminId: req.user.userId, days, previousEndsAt: shop.subscriptionEndsAt, subscriptionEndsAt, plan: nextPlan },
  };

  res.json({ shop: updated, active: isSubscriptionActive(updated), message: `Subscription extended by ${days} days` });
});

const adminRemoveSubscription = asyncHandler(async (req, res) => {
  const { shopId } = req.params;
  const reason = String(req.body?.reason || "").trim() || null;

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { id: true, name: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true },
  });
  if (!shop) return res.status(404).json({ error: "Shop not found" });

  const updated = await prisma.shop.update({
    where: { id: shopId },
    data: {
      plan: "FREE_TRIAL",
      trialEndsAt: new Date(),
      subscriptionEndsAt: null,
      isActive: true,
    },
    select: { id: true, name: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true },
  });

  req.audit = {
    action: "admin.subscription.removed",
    resourceType: "shop",
    resourceId: shopId,
    metadata: {
      adminId: req.user.userId,
      reason,
      previousPlan: shop.plan,
      previousEndsAt: shop.subscriptionEndsAt,
    },
  };

  res.json({ shop: updated, active: isSubscriptionActive(updated), message: "Paid subscription removed" });
});

const adminRecordPayment = asyncHandler(async (req, res) => {
  const { shopId } = req.params;
  const plan = String(req.body.plan || "BASIC").toUpperCase();
  const months = Math.max(1, Math.min(24, Number(req.body.months) || 1));
  const amount = Number(req.body.amount);
  const method = String(req.body.method || "MANUAL").toUpperCase();
  const reference = String(req.body.reference || "").trim() || null;
  const normalizedReference = normalizePaymentReference(reference);
  const note = String(req.body.note || "").trim() || null;
  const proofUrl = String(req.body.proofUrl || "").trim() || null;
  const sourceReportId = String(req.body.sourceReportId || "").trim() || null;

  if (!["BASIC", "PRO"].includes(plan)) return res.status(400).json({ error: "Plan must be BASIC or PRO" });
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: "Payment amount must be a whole positive TZS amount" });
  if (!normalizedReference) return res.status(400).json({ error: "Payment reference is required" });

  const duplicate = await prisma.subscriptionPayment.findFirst({
    where: {
      OR: [
        { normalizedReference },
        ...(sourceReportId ? [{ sourceReportId }] : []),
      ],
    },
  });
  if (duplicate) {
    if (duplicate.shopId !== shopId) return res.status(409).json({ error: "This payment reference is already linked to another shop" });
    const shop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { id: true, name: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true },
    });
    return res.json({ payment: duplicate, shop, active: isSubscriptionActive(shop), reused: true });
  }

  const existing = await prisma.shop.findUnique({ where: { id: shopId }, select: { subscriptionEndsAt: true } });
  if (!existing) return res.status(404).json({ error: "Shop not found" });

  const now = new Date();
  const base = existing.subscriptionEndsAt && existing.subscriptionEndsAt > now ? existing.subscriptionEndsAt : now;
  let subscriptionEndsAt = addMonthsClamped(base, months);

  let payment;
  let shop;
  try {
    [payment, shop] = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM shops WHERE id = ${shopId} FOR UPDATE`;
      const lockedShop = await tx.shop.findUnique({ where: { id: shopId } });
      if (lockedShop.parentShopId) throw Object.assign(new Error("Record payment against the main business, not an individual branch"), { status: 400 });
      const quote = priceSubscription(lockedShop, { ...req.body, plan, months });
      await validateBranchCapacity(tx, shopId, plan, quote.extraBranches);
      if ((quote.extraBranches > 0 || quote.kind === "BRANCH_ADDON") && amount < quote.amount) throw Object.assign(new Error(`Payment must cover TZS ${quote.amount}`), { status: 400 });
      const renewalBase = lockedShop.subscriptionEndsAt && lockedShop.subscriptionEndsAt > now ? lockedShop.subscriptionEndsAt : now;
      subscriptionEndsAt = quote.kind === "BRANCH_ADDON" ? lockedShop.subscriptionEndsAt : addMonthsClamped(renewalBase, months);
      const recorded = await tx.subscriptionPayment.create({
      data: {
        shopId,
        plan,
        amount,
        months: quote.months,
        kind: quote.kind,
        extraBranches: quote.extraBranches,
        method,
        reference,
        normalizedReference,
        note,
        proofUrl,
        sourceReportId,
        status: "CONFIRMED",
        reviewedBy: req.user.userId,
        reviewedAt: now,
      },
      });
      const updated = await tx.shop.update({
      where: { id: shopId },
      data: { plan, subscriptionEndsAt, isActive: true, additionalBranchSlots: quote.extraBranches },
      select: { id: true, name: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true },
      });
      return [recorded, updated];
    });
  } catch (error) {
    if (error?.code !== "P2002") throw error;
    const existingPayment = await prisma.subscriptionPayment.findFirst({
      where: { OR: [{ normalizedReference }, ...(sourceReportId ? [{ sourceReportId }] : [])] },
    });
    if (!existingPayment || existingPayment.shopId !== shopId) throw error;
    const currentShop = await prisma.shop.findUnique({
      where: { id: shopId },
      select: { id: true, name: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true },
    });
    return res.json({ payment: existingPayment, shop: currentShop, active: isSubscriptionActive(currentShop), reused: true });
  }

  req.audit = {
    action: "admin.subscription.paymentRecorded",
    resourceType: "shop",
    resourceId: shopId,
    metadata: { adminId: req.user.userId, paymentId: payment.id, plan, amount, months, method, previousEndsAt: existing.subscriptionEndsAt, subscriptionEndsAt },
  };

  res.status(201).json({ payment, shop, active: isSubscriptionActive(shop), previousEndsAt: existing.subscriptionEndsAt, subscriptionEndsAt });
});

module.exports = { getStatus, adminListSubscriptions, adminUpdateSubscription, adminExtendTrial, adminExtendSubscription, adminRemoveSubscription, adminRecordPayment, subscriptionSnapshot, subscriptionStatusWhere };
