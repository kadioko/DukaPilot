const webpush = require("web-push");
const crypto = require("node:crypto");
const prisma = require("../lib/prisma");
const { isSubscriptionActive } = require("../middleware/subscription");

const DAY_MS = 24 * 60 * 60 * 1000;

function configured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function configureWebPush() {
  if (!configured()) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return true;
}

function retryAt(attemptCount) {
  const minutes = Math.min(60 * 24, 2 ** Math.max(0, attemptCount - 1) * 5);
  return new Date(Date.now() + minutes * 60 * 1000);
}

function staffCanReceiveKind(staff, kind) {
  if (!staff?.isActive) return false;
  if (kind === "LOW_STOCK") return Boolean(staff.canManageStock);
  if (kind === "DEBT_DUE") return Boolean(staff.canViewReports);
  if (kind === "QUOTATION_REMINDER") return Boolean(staff.canViewQuotations);
  if (kind === "DAILY_ASSISTANT") return Boolean(staff.canUseAssistant && staff.canViewReports);
  // Billing and unknown shop-wide alerts are owner-only.
  return false;
}

async function queueForShop(shopId, kind, message) {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { shopId, isActive: true },
    select: { id: true, staffId: true },
  });
  if (!subscriptions.length) return false;
  const staffIds = subscriptions.map((subscription) => subscription.staffId).filter(Boolean);
  const staff = staffIds.length ? await prisma.staffMember.findMany({
    where: { id: { in: staffIds }, shopId, isActive: true },
    select: { id: true, isActive: true, canManageStock: true, canViewReports: true, canViewQuotations: true, canUseAssistant: true },
  }) : [];
  const staffById = new Map(staff.map((member) => [member.id, member]));
  const eligible = subscriptions.filter((subscription) => !subscription.staffId || staffCanReceiveKind(staffById.get(subscription.staffId), kind));
  if (!eligible.length) return false;

  const dayKey = new Date().toISOString().slice(0, 10);
  const created = await prisma.pushDelivery.createMany({
    data: eligible.map((subscription) => ({
      shopId,
      subscriptionId: subscription.id,
      kind,
      dedupeKey: `${dayKey}:${shopId}:${subscription.id}:${kind}`,
      ...message,
    })),
    skipDuplicates: true,
  });
  return created.count > 0;
}

async function queueShopAlerts({ afterId = null, limit = 100 } = {}) {
  const batchSize = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const shops = await prisma.shop.findMany({
    where: afterId ? { id: { gt: afterId } } : undefined,
    select: {
      id: true,
      plan: true,
      trialEndsAt: true,
      subscriptionEndsAt: true,
      isActive: true,
      user: { select: { language: true } },
      parentShop: { select: { user: { select: { language: true } } } },
      notificationPreference: true,
      products: { where: { isActive: true }, select: { name: true, currentStock: true, minimumStock: true } },
      debts: { where: { status: { in: ["OPEN", "PARTIAL"] } }, select: { amount: true, amountPaid: true, dueDate: true } },
      assistantActions: { where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 1, select: { title: true, href: true } },
    },
    orderBy: { id: "asc" },
    take: batchSize,
  });
  let queued = 0;
  const now = new Date();
  const expiryWindow = new Date(now.getTime() + 7 * DAY_MS);

  for (const shop of shops) {
    const sw = (shop.user?.language || shop.parentShop?.user?.language || "sw") !== "en";
    const preference = shop.notificationPreference || { lowStock: true, debtDue: true, subscriptionExpiry: true, dailyAssistant: false };
    const lowStock = shop.products.filter((product) => product.currentStock <= product.minimumStock);
    if (preference.lowStock && lowStock.length) {
      queued += Number(await queueForShop(shop.id, "LOW_STOCK", {
        title: sw ? "DukaPilot: stock inahitaji uangalizi" : "DukaPilot: stock needs attention",
        body: sw ? `${lowStock[0].name}${lowStock.length > 1 ? ` na bidhaa nyingine ${lowStock.length - 1}` : ""} inahitaji kuagizwa.` : `${lowStock[0].name}${lowStock.length > 1 ? ` and ${lowStock.length - 1} more item${lowStock.length === 2 ? "" : "s"}` : ""} need restocking.`,
        href: "/inventory?stockStatus=LOW",
      }));
    }

    const overdue = shop.debts.filter((debt) => debt.dueDate && debt.dueDate <= now);
    if (preference.debtDue && overdue.length) {
      const outstanding = overdue.reduce((total, debt) => total + debt.amount - debt.amountPaid, 0);
      queued += Number(await queueForShop(shop.id, "DEBT_DUE", {
        title: sw ? "DukaPilot: fuatilia deni la mteja" : "DukaPilot: collect customer debt",
        body: sw ? `TZS ${outstanding.toLocaleString("en-TZ")} inadaiwa kutoka kwa wateja ${overdue.length}.` : `TZS ${outstanding.toLocaleString("en-TZ")} is due from ${overdue.length} customer${overdue.length === 1 ? "" : "s"}.`,
        href: "/debts?status=open",
      }));
    }

    const expiry = shop.plan === "FREE_TRIAL" ? shop.trialEndsAt : shop.subscriptionEndsAt;
    if (preference.subscriptionExpiry && (!isSubscriptionActive(shop) || (expiry && expiry <= expiryWindow))) {
      queued += Number(await queueForShop(shop.id, "SUBSCRIPTION", {
        title: sw ? "DukaPilot: mpango unahitaji hatua" : "DukaPilot: subscription action needed",
        body: !isSubscriptionActive(shop)
          ? (sw ? "Duka linahitaji kuhuishwa ili kuendelea kurekodi mauzo." : "Your shop needs reactivation to keep recording sales.")
          : (sw ? "Mpango unaisha hivi karibuni. Tuma taarifa za malipo ili duka liendelee." : "Your plan ends soon. Send payment details to keep the shop active."),
        href: "/billing",
      }));
    }

    const action = shop.assistantActions[0];
    if (preference.dailyAssistant && action) {
      queued += Number(await queueForShop(shop.id, "DAILY_ASSISTANT", {
        title: sw ? "Kipaumbele cha DukaPilot AI" : "DukaPilot AI priority",
        body: action.title,
        href: action.href || "/assistant",
      }));
    }
  }
  return { queued, scanned: shops.length, nextCursor: shops.length === batchSize ? shops.at(-1).id : null };
}

async function processPushDeliveries(limit = 100) {
  if (!configureWebPush()) return { configured: false, processed: 0, sent: 0, failed: 0 };
  const now = new Date();
  const deliveries = await prisma.pushDelivery.findMany({
    where: {
      OR: [
        { status: { in: ["QUEUED", "RETRYING"] }, retryAt: null, leaseExpiresAt: null },
        { status: { in: ["QUEUED", "RETRYING"] }, retryAt: { lte: now }, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }] },
        { status: "SENDING", leaseExpiresAt: { lte: now } },
      ],
    },
    include: {
      subscription: true,
      shop: {
        select: {
          notificationPreference: true,
          user: { select: { language: true } },
          parentShop: { select: { user: { select: { language: true } } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(Number(limit) || 100, 1), 500),
  });
  const staffIds = [...new Set(deliveries.map((delivery) => delivery.subscription?.staffId).filter(Boolean))];
  const activeStaff = staffIds.length ? await prisma.staffMember.findMany({
    where: { id: { in: staffIds }, isActive: true },
    select: { id: true, shopId: true, isActive: true, canManageStock: true, canViewReports: true, canViewQuotations: true, canUseAssistant: true },
  }) : [];
  const staffById = new Map(activeStaff.map((member) => [member.id, member]));
  let sent = 0;
  let failed = 0;
  for (const delivery of deliveries) {
    const leaseId = crypto.randomUUID();
    const claimed = await prisma.pushDelivery.updateMany({
      where: { id: delivery.id, status: delivery.status, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }] },
      data: { status: "SENDING", leaseId, leaseExpiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    });
    if (claimed.count !== 1) continue;
    const subscription = delivery.subscription;
    if (!subscription || !subscription.isActive) {
      await prisma.pushDelivery.update({ where: { id: delivery.id }, data: { status: "SKIPPED", lastError: "Inactive subscription", leaseId: null, leaseExpiresAt: null } });
      continue;
    }
    if (subscription.staffId) {
      const staff = staffById.get(subscription.staffId);
      if (!staff || staff.shopId !== delivery.shopId || !staffCanReceiveKind(staff, delivery.kind)) {
        await prisma.$transaction([
          prisma.pushDelivery.update({ where: { id: delivery.id }, data: { status: "SKIPPED", lastError: "Staff access no longer permits this alert", leaseId: null, leaseExpiresAt: null } }),
          ...(!staff || !staff.isActive ? [prisma.pushSubscription.update({ where: { id: subscription.id }, data: { isActive: false } })] : []),
        ]);
        continue;
      }
    }
    const preferenceKey = { LOW_STOCK: "lowStock", DEBT_DUE: "debtDue", SUBSCRIPTION: "subscriptionExpiry", DAILY_ASSISTANT: "dailyAssistant" }[delivery.kind];
    const preferences = delivery.shop?.notificationPreference;
    if (preferenceKey && preferences && preferences[preferenceKey] === false) {
      await prisma.pushDelivery.update({ where: { id: delivery.id }, data: { status: "SKIPPED", lastError: "Alert preference disabled", leaseId: null, leaseExpiresAt: null } });
      continue;
    }
    try {
      const hideDetails = preferences?.privatePreview !== false;
      const language = delivery.shop?.user?.language || delivery.shop?.parentShop?.user?.language || "sw";
      const privateTitle = language === "en" ? "DukaPilot shop update" : "Taarifa ya duka kutoka DukaPilot";
      const privateBody = language === "en" ? "Open DukaPilot to view this shop update." : "Fungua DukaPilot kuona taarifa hii ya duka.";
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: hideDetails ? privateTitle : delivery.title, body: hideDetails ? privateBody : delivery.body, href: delivery.href, tag: delivery.kind }));
      await prisma.$transaction([
        prisma.pushDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", sentAt: new Date(), attemptCount: { increment: 1 }, lastError: null, leaseId: null, leaseExpiresAt: null } }),
        prisma.pushSubscription.update({ where: { id: subscription.id }, data: { lastSeenAt: new Date(), failureCount: 0 } }),
      ]);
      sent += 1;
    } catch (error) {
      const statusCode = Number(error.statusCode || error.status);
      const invalidSubscription = statusCode === 404 || statusCode === 410;
      const terminal = invalidSubscription || delivery.attemptCount >= 4;
      await prisma.$transaction([
        prisma.pushDelivery.update({ where: { id: delivery.id }, data: { status: terminal ? "FAILED" : "RETRYING", attemptCount: { increment: 1 }, lastError: String(error.message || "Push delivery failed").slice(0, 500), retryAt: terminal ? null : retryAt(delivery.attemptCount + 1), leaseId: null, leaseExpiresAt: null } }),
        prisma.pushSubscription.update({ where: { id: subscription.id }, data: invalidSubscription ? { isActive: false, failureCount: { increment: 1 } } : { failureCount: { increment: 1 } } }),
      ]);
      failed += 1;
    }
  }
  return { configured: true, processed: deliveries.length, sent, failed };
}

module.exports = { configured, queueForShop, queueShopAlerts, processPushDeliveries, staffCanReceiveKind };
