const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { phoneLookupValues } = require("../lib/phone");

const SALES_REQUIRED = 10;
const REWARD_DAYS = 7;

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

function normalizeReferralCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^DP-[A-Z0-9-]{8,80}$/.test(code) ? code : "";
}

async function completeSaleCounts(client, shopIds) {
  if (!shopIds.length) return new Map();
  const rows = await client.sale.groupBy({
    by: ["shopId"],
    where: { shopId: { in: shopIds }, status: "COMPLETED" },
    _count: { id: true },
  });
  return new Map(rows.map((row) => [row.shopId, row._count.id]));
}

async function qualifyPendingReferrals(client, referrals) {
  const saleCounts = await completeSaleCounts(client, referrals.map((referral) => referral.referredShopId));
  const newlyQualifiedIds = referrals
    .filter((referral) => referral.status === "PENDING" && (saleCounts.get(referral.referredShopId) || 0) >= SALES_REQUIRED)
    .map((referral) => referral.id);

  if (newlyQualifiedIds.length) {
    await client.shopReferral.updateMany({
      where: { id: { in: newlyQualifiedIds }, status: "PENDING" },
      data: { status: "QUALIFIED", qualifiedAt: new Date() },
    });
  }

  return { saleCounts, newlyQualifiedIds };
}

const getMyReferrals = asyncHandler(async (req, res) => {
  if (req.user.staffId) return res.status(403).json({ error: "Only the shop owner can view referral rewards" });

  const shopId = await getShopIdForUser(req.user);
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      id: true,
      referralCode: true,
      referralsMade: {
        include: {
          referredShop: { select: { id: true, name: true, createdAt: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
  });
  if (!shop) return res.status(404).json({ error: "Shop not found" });

  const { saleCounts, newlyQualifiedIds } = await qualifyPendingReferrals(prisma, shop.referralsMade);
  res.json({
    referralCode: shop.referralCode,
    salesRequired: SALES_REQUIRED,
    rewardDays: REWARD_DAYS,
    referrals: shop.referralsMade.map((referral) => {
      const salesCount = saleCounts.get(referral.referredShopId) || 0;
      const status = newlyQualifiedIds.includes(referral.id) ? "QUALIFIED" : referral.status;
      return {
        id: referral.id,
        status,
        salesCount,
        salesRemaining: Math.max(0, SALES_REQUIRED - salesCount),
        qualifiedAt: referral.qualifiedAt,
        rewardedAt: referral.rewardedAt,
        referredShop: referral.referredShop,
      };
    }),
  });
});

// Admin: a truthful queue of referrals and their qualification progress.
const adminListReferrals = asyncHandler(async (req, res) => {
  const status = String(req.query.status || "ALL").toUpperCase();
  if (!["ALL", "PENDING", "QUALIFIED", "REWARDED", "REJECTED"].includes(status)) {
    return res.status(400).json({ error: "Invalid referral status" });
  }

  const referrals = await prisma.shopReferral.findMany({
    where: status === "ALL" ? undefined : { status },
    include: {
      referrerShop: { select: { id: true, name: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, user: { select: { name: true, phone: true } } } },
      referredShop: { select: { id: true, name: true, createdAt: true, user: { select: { name: true, phone: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });

  const { saleCounts, newlyQualifiedIds } = await qualifyPendingReferrals(prisma, referrals);

  res.json({
    salesRequired: SALES_REQUIRED,
    rewardDays: REWARD_DAYS,
    referrals: referrals.map((referral) => {
      const salesCount = saleCounts.get(referral.referredShopId) || 0;
      const statusValue = newlyQualifiedIds.includes(referral.id) ? "QUALIFIED" : referral.status;
      return {
        ...referral,
        status: statusValue,
        salesCount,
        salesRemaining: Math.max(0, SALES_REQUIRED - salesCount),
        rewardEligible: statusValue === "QUALIFIED",
      };
    }),
  });
});

// Admin: grant one free week once, only after the new shop reaches ten completed sales.
const adminRewardReferral = asyncHandler(async (req, res) => {
  const { referralId } = req.params;
  const note = String(req.body?.note || "").trim().slice(0, 1000) || null;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const referral = await tx.shopReferral.findUnique({
      where: { id: referralId },
      include: {
        referrerShop: { select: { id: true, name: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true } },
        referredShop: { select: { id: true, name: true } },
      },
    });
    if (!referral) throw httpError("Referral not found", 404);
    if (referral.status === "REWARDED") throw httpError("This referral reward has already been granted", 409);
    if (referral.status === "REJECTED") throw httpError("This referral was marked not valid", 409);

    const salesCount = await tx.sale.count({ where: { shopId: referral.referredShopId, status: "COMPLETED" } });
    if (salesCount < SALES_REQUIRED) {
      throw httpError(`The referred shop needs ${SALES_REQUIRED - salesCount} more completed sale(s) before this reward can be granted`, 400);
    }

    // Conditional update prevents two admins from awarding the same referral.
    const claim = await tx.shopReferral.updateMany({
      where: { id: referralId, status: { in: ["PENDING", "QUALIFIED"] } },
      data: { status: "REWARDED", qualifiedAt: referral.qualifiedAt || now, rewardedAt: now, rewardedBy: req.user.userId, note },
    });
    if (claim.count !== 1) throw httpError("This referral reward was just handled by another admin", 409);

    const paidPlanActive = ["BASIC", "PRO"].includes(referral.referrerShop.plan)
      && referral.referrerShop.subscriptionEndsAt
      && referral.referrerShop.subscriptionEndsAt > now;
    const baseDate = paidPlanActive
      ? referral.referrerShop.subscriptionEndsAt
      : referral.referrerShop.trialEndsAt && referral.referrerShop.trialEndsAt > now
        ? referral.referrerShop.trialEndsAt
        : now;

    const shop = await tx.shop.update({
      where: { id: referral.referrerShopId },
      data: paidPlanActive
        ? { subscriptionEndsAt: addDays(baseDate, REWARD_DAYS), isActive: true }
        : { plan: "FREE_TRIAL", trialEndsAt: addDays(baseDate, REWARD_DAYS), isActive: true },
      select: { id: true, name: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true },
    });

    return { referral, shop, salesCount, rewardAppliedTo: paidPlanActive ? "subscription" : "trial" };
  });

  req.audit = {
    action: "admin.referral.rewarded",
    resourceType: "shop_referral",
    resourceId: referralId,
    metadata: {
      adminId: req.user.userId,
      referrerShopId: result.referral.referrerShopId,
      referredShopId: result.referral.referredShopId,
      salesCount: result.salesCount,
      rewardDays: REWARD_DAYS,
      rewardAppliedTo: result.rewardAppliedTo,
    },
  };

  res.json({ referralId, shop: result.shop, message: `Added ${REWARD_DAYS} free days to ${result.shop.name}` });
});

// Admin-only recovery for a genuine referral that was missed during signup.
// A mandatory note and the normal 10-sale qualification rule keep this from
// becoming an untracked way to grant subscription time.
const adminRecoverReferral = asyncHandler(async (req, res) => {
  const referralCode = normalizeReferralCode(req.body?.referralCode);
  const referredPhone = String(req.body?.referredPhone || "").trim();
  const note = String(req.body?.note || "").trim().slice(0, 1000);
  if (!referralCode) return res.status(400).json({ error: "Enter a valid referrer's referral code" });
  if (!referredPhone) return res.status(400).json({ error: "Enter the new shop owner's phone number" });
  if (note.length < 3) return res.status(400).json({ error: "Add a short note explaining why this referral is being recovered" });

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const referrerShop = await tx.shop.findUnique({
      where: { referralCode },
      select: { id: true, name: true, referralCode: true },
    });
    if (!referrerShop) throw httpError("Referral code was not found", 404);

    const referredUser = await tx.user.findFirst({
      where: { phone: { in: phoneLookupValues(referredPhone) }, role: "MERCHANT" },
      select: { id: true, shop: { select: { id: true, name: true } } },
    });
    if (!referredUser?.shop) throw httpError("A merchant shop was not found for that phone number", 404);
    if (referredUser.shop.id === referrerShop.id) throw httpError("A shop cannot refer itself", 400);

    const existing = await tx.shopReferral.findUnique({ where: { referredShopId: referredUser.shop.id } });
    if (existing) throw httpError("This new shop is already linked to a referral", 409);

    const salesCount = await tx.sale.count({ where: { shopId: referredUser.shop.id, status: "COMPLETED" } });
    const qualified = salesCount >= SALES_REQUIRED;
    const referral = await tx.shopReferral.create({
      data: {
        referrerShopId: referrerShop.id,
        referredShopId: referredUser.shop.id,
        referralCode: referrerShop.referralCode,
        status: qualified ? "QUALIFIED" : "PENDING",
        qualifiedAt: qualified ? now : null,
        note: `Recovered by admin: ${note}`,
      },
      select: { id: true, status: true, referrerShopId: true, referredShopId: true },
    });
    return { referral, referrerShop, referredShop: referredUser.shop, salesCount };
  });

  req.audit = {
    action: "admin.referral.recovered",
    resourceType: "shop_referral",
    resourceId: result.referral.id,
    metadata: {
      adminId: req.user.userId,
      referrerShopId: result.referral.referrerShopId,
      referredShopId: result.referral.referredShopId,
      salesCount: result.salesCount,
      qualified: result.referral.status === "QUALIFIED",
      note,
    },
  };

  res.status(201).json({
    referral: result.referral,
    message: result.referral.status === "QUALIFIED"
      ? `Recovered referral for ${result.referredShop.name}. It is ready for the 7-day reward.`
      : `Recovered referral for ${result.referredShop.name}. It needs ${Math.max(0, SALES_REQUIRED - result.salesCount)} more completed sale(s) before the reward.`,
  });
});

const adminRejectReferral = asyncHandler(async (req, res) => {
  const { referralId } = req.params;
  const note = String(req.body?.note || "").trim().slice(0, 1000) || "Marked not valid by admin";
  const referral = await prisma.shopReferral.updateMany({
    where: { id: referralId, status: { in: ["PENDING", "QUALIFIED"] } },
    data: { status: "REJECTED", note },
  });
  if (!referral.count) return res.status(409).json({ error: "This referral is already closed or was not found" });

  req.audit = {
    action: "admin.referral.rejected",
    resourceType: "shop_referral",
    resourceId: referralId,
    metadata: { adminId: req.user.userId, note },
  };
  res.json({ message: "Referral marked not valid" });
});

module.exports = { getMyReferrals, adminListReferrals, adminRewardReferral, adminRecoverReferral, adminRejectReferral, SALES_REQUIRED, REWARD_DAYS };
