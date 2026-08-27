const prisma = require("../lib/prisma");
const { queueForShop, processPushDeliveries } = require("./push.service");

const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(value, now = new Date()) {
  const target = new Date(value); target.setHours(0, 0, 0, 0);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

function copy(language, type, quote, remaining) {
  const sw = language === "sw";
  if (type === "EXPIRING_SOON") return {
    title: sw ? `${quote.quotationNumber} inaisha hivi karibuni` : `${quote.quotationNumber} expires soon`,
    body: sw ? `Fuatilia ${quote.customer.name} kuhusu ${quote.projectTitle} kabla muda wa bei kuisha.` : `Follow up with ${quote.customer.name} about ${quote.projectTitle} before the price expires.`,
  };
  if (type === "DEPOSIT_OVERDUE") return {
    title: sw ? `Amana ya ${quote.quotationNumber} imechelewa` : `Deposit overdue for ${quote.quotationNumber}`,
    body: sw ? `${quote.customer.name} bado anadaiwa TZS ${remaining.toLocaleString("en-TZ")} ya amana.` : `${quote.customer.name} still owes TZS ${remaining.toLocaleString("en-TZ")} of the required deposit.`,
  };
  return {
    title: sw ? `${quote.customer.name} ameona ${quote.quotationNumber}` : `${quote.customer.name} viewed ${quote.quotationNumber}`,
    body: sw ? "Nukuu imeonekana lakini bado haijakubaliwa. Fanya follow-up ya heshima." : "The quotation was viewed but has not been accepted. Send a respectful follow-up.",
  };
}

async function recordReminder(quote, type, now) {
  const existing = await prisma.quotationReminder.findUnique({ where: { quotationId_type_revisionNumber: { quotationId: quote.id, type, revisionNumber: quote.currentRevisionNumber } } });
  if (existing) return false;
  try {
    await prisma.quotationReminder.create({ data: { quotationId: quote.id, type, revisionNumber: quote.currentRevisionNumber, sentAt: now } });
  } catch (error) {
    if (error.code === "P2002") return false;
    throw error;
  }
  const remaining = Math.max(0, quote.depositRequiredAmount - quote.amountPaid);
  const message = copy(quote.shop.user.language, type, quote, remaining);
  const href = `/quotations?status=${quote.status}`;
  const actionKey = `quotation-reminder:${type}:${quote.id}:r${quote.currentRevisionNumber}`;
  await prisma.assistantAction.upsert({
    where: { shopId_actionKey: { shopId: quote.shopId, actionKey } },
    create: { shopId: quote.shopId, actionKey, title: message.title, href, status: "OPEN" },
    update: { title: message.title, href, status: "OPEN" },
  });
  await queueForShop(quote.shopId, "QUOTATION_REMINDER", { title: message.title, body: message.body, href });
  return true;
}

async function runQuotationReminders(now = new Date()) {
  const viewedThreshold = new Date(now.getTime() - DAY_MS);
  const expiringBy = new Date(now.getTime() + (3 * DAY_MS));
  const candidates = await prisma.quotation.findMany({
    // Only fetch quotations that can actually produce one of the three
    // reminders. This prevents a cron run from scanning the full quote table.
    where: {
      status: { in: ["SENT", "ACCEPTED"] },
      OR: [
        { status: "SENT", expiryDate: { gte: now, lte: expiringBy } },
        { depositDueDate: { lt: now } },
        { status: "SENT", shares: { some: { viewedAt: { lte: viewedThreshold }, acceptedAt: null } } },
      ],
    },
    select: {
      id: true, shopId: true, quotationNumber: true, currentRevisionNumber: true, status: true, projectTitle: true,
      expiryDate: true, depositDueDate: true, depositRequiredAmount: true, amountPaid: true,
      customer: { select: { name: true } },
      shares: { select: { revisionNumber: true, viewedAt: true, acceptedAt: true } },
      shop: { select: { user: { select: { language: true } } } },
    },
    orderBy: { updatedAt: "asc" },
    take: 500,
  });
  const counts = { expiringSoon: 0, depositOverdue: 0, viewedNotAccepted: 0 };
  for (const quote of candidates) {
    if (quote.status === "SENT" && quote.expiryDate && daysUntil(quote.expiryDate, now) >= 0 && daysUntil(quote.expiryDate, now) <= 3) {
      counts.expiringSoon += Number(await recordReminder(quote, "EXPIRING_SOON", now));
    }
    if (quote.depositDueDate && quote.depositDueDate < now && quote.depositRequiredAmount > quote.amountPaid) {
      counts.depositOverdue += Number(await recordReminder(quote, "DEPOSIT_OVERDUE", now));
    }
    const viewedCurrent = quote.shares.some((share) => share.revisionNumber === quote.currentRevisionNumber && share.viewedAt && share.viewedAt <= viewedThreshold && !share.acceptedAt);
    if (quote.status === "SENT" && viewedCurrent) counts.viewedNotAccepted += Number(await recordReminder(quote, "VIEWED_NOT_ACCEPTED", now));
  }
  const push = await processPushDeliveries();
  return { scanned: candidates.length, created: counts.expiringSoon + counts.depositOverdue + counts.viewedNotAccepted, ...counts, push };
}

module.exports = { runQuotationReminders };
