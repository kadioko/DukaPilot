const prisma = require("../lib/prisma");
const { getBillingShopIdForUser, getShopIdForUser } = require("../lib/shopAccess");
const { isSubscriptionActive } = require("../middleware/subscription");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const billingShopId = req.user.staffId ? null : await getBillingShopIdForUser(req.user);
  const permissions = req.user.staffId ? req.user.permissions || {} : {
    canSell: true,
    canManageStock: true,
    canManageStaff: true,
    canViewReports: true,
  };

  const [shop, products, debts, customerOrders, syncFailures, quotations, referralRewards] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: shopId },
      select: { id: true, plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true },
    }),
    permissions.canManageStock
      ? prisma.product.findMany({ where: { shopId, isActive: true }, select: { id: true, name: true, currentStock: true, minimumStock: true, unit: true } })
      : [],
    permissions.canSell
      ? prisma.debt.findMany({ where: { shopId, status: { in: ["OPEN", "PARTIAL"] } }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], take: 20 })
      : [],
    permissions.canSell
      ? prisma.customerOrder.findMany({ where: { shopId, status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 20 })
      : [],
    permissions.canViewReports
      ? prisma.offlineSyncEvent.findMany({ where: { shopId, status: "FAILED", resolutionStatus: { not: "RESOLVED" } }, orderBy: { createdAt: "desc" }, take: 20 })
      : [],
    permissions.canViewQuotations || !req.user.staffId
      ? prisma.quotation.findMany({ where: { shopId, status: { in: ["SENT", "ACCEPTED"] } }, select: { id: true, quotationNumber: true, status: true, expiryDate: true, depositDueDate: true, depositRequiredAmount: true, amountPaid: true }, orderBy: { updatedAt: "desc" }, take: 100 })
      : [],
    billingShopId
      ? prisma.shopReferral.findMany({
        where: { referrerShopId: billingShopId, status: "REWARDED", rewardedAt: { gte: new Date(Date.now() - 90 * 86400000) } },
        select: { id: true, rewardedAt: true, referredShop: { select: { name: true } } },
        orderBy: { rewardedAt: "desc" },
        take: 20,
      })
      : [],
  ]);

  const items = [];
  for (const reward of referralRewards) {
    const referredShopName = reward.referredShop?.name || "a referred shop";
    items.push({
      id: `referral-reward-${reward.id}`,
      type: "REFERRAL_REWARD",
      severity: "ACTION",
      title: "Referral reward confirmed",
      titleSw: "Zawadi ya referral imethibitishwa",
      description: `An admin added 7 free days to your account after ${referredShopName} qualified. Open Referrals to see your reward status.`,
      descriptionSw: `Admin ameongeza siku 7 za bure kwenye akaunti yako baada ya ${referredShopName} kustahili. Fungua Mialiko na Zawadi kuona hali ya zawadi yako.`,
      href: "/referrals",
      count: 1,
      createdAt: reward.rewardedAt,
    });
  }

  const lowStock = products.filter((product) => product.currentStock <= product.minimumStock);
  if (lowStock.length) {
    const outCount = lowStock.filter((product) => product.currentStock === 0).length;
    items.push({
      id: "low-stock",
      type: "LOW_STOCK",
      severity: outCount ? "URGENT" : "WARNING",
      title: `${lowStock.length} low-stock item${lowStock.length === 1 ? "" : "s"}`,
      titleSw: `Bidhaa ${lowStock.length} zina stock ndogo`,
      description: outCount ? `${outCount} item${outCount === 1 ? " is" : "s are"} out of stock.` : `${lowStock[0].name} needs attention first.`,
      descriptionSw: outCount ? `Bidhaa ${outCount} zimeisha kabisa.` : `${lowStock[0].name} inahitaji kuagizwa kwanza.`,
      href: "/inventory?stockStatus=LOW",
      count: lowStock.length,
    });
  }

  if (debts.length) {
    const owed = debts.reduce((sum, debt) => sum + debt.amount - debt.amountPaid, 0);
    items.push({
      id: "open-debts",
      type: "DEBT",
      severity: "WARNING",
      title: `Collect TZS ${Math.round(owed).toLocaleString("en-TZ")} from ${debts.length} customer${debts.length === 1 ? "" : "s"}`,
      titleSw: `Kusanya TZS ${Math.round(owed).toLocaleString("en-TZ")} kwa wateja ${debts.length}`,
      description: "Open customer credit is waiting for follow-up.",
      descriptionSw: "Madeni ya wateja yanasubiri kufuatiliwa.",
      href: "/debts?status=open",
      count: debts.length,
    });
  }

  if (customerOrders.length) {
    items.push({
      id: "customer-orders",
      type: "CUSTOMER_ORDER",
      severity: "ACTION",
      title: `${customerOrders.length} catalog order${customerOrders.length === 1 ? " is" : "s are"} waiting`,
      titleSw: `Maagizo ${customerOrders.length} ya catalog yanasubiri`,
      description: "Confirm available stock before the customer waits too long.",
      descriptionSw: "Thibitisha stock kabla mteja hajasubiri muda mrefu.",
      href: "/orders/customers?filter=pending",
      count: customerOrders.length,
    });
  }

  if (syncFailures.length) {
    items.push({
      id: "sync-failures",
      type: "SYNC",
      severity: "WARNING",
      title: `${syncFailures.length} offline sale sync issue${syncFailures.length === 1 ? "" : "s"}`,
      titleSw: `Hitilafu ${syncFailures.length} za kusawazisha mauzo`,
      description: "Review the Sales sync history before removing any local sale.",
      descriptionSw: "Kagua historia ya sync kwenye Mauzo kabla ya kuondoa sale yoyote.",
      href: "/sales?sync=history",
      count: syncFailures.length,
    });
  }

  const now = new Date();
  const expiringQuotes = quotations.filter((quote) => quote.status === "SENT" && quote.expiryDate && quote.expiryDate >= now && quote.expiryDate <= new Date(now.getTime() + 3 * 86400000));
  const overdueDeposits = quotations.filter((quote) => quote.depositDueDate && quote.depositDueDate < now && quote.depositRequiredAmount > quote.amountPaid);
  if (overdueDeposits.length) {
    items.push({ id: "quotation-deposits", type: "QUOTATION", severity: "URGENT", title: `${overdueDeposits.length} quotation deposit${overdueDeposits.length === 1 ? " is" : "s are"} overdue`, titleSw: `Amana ${overdueDeposits.length} za nukuu zimechelewa`, description: "Open quotations to record payment or follow up with the customer.", descriptionSw: "Fungua nukuu kurekodi malipo au kufuatilia mteja.", href: "/quotations?status=ACCEPTED", count: overdueDeposits.length });
  }
  if (expiringQuotes.length) {
    items.push({ id: "quotation-expiring", type: "QUOTATION", severity: "WARNING", title: `${expiringQuotes.length} quotation${expiringQuotes.length === 1 ? "" : "s"} expire soon`, titleSw: `Nukuu ${expiringQuotes.length} zinaisha muda hivi karibuni`, description: "Follow up before the quoted price expires.", descriptionSw: "Fuatilia kabla muda wa bei kuisha.", href: "/quotations?status=SENT", count: expiringQuotes.length });
  }

  if (!req.user.staffId && shop && !isSubscriptionActive(shop)) {
    items.unshift({
      id: "subscription",
      type: "SUBSCRIPTION",
      severity: "URGENT",
      title: "Subscription action required",
      titleSw: "Subscription inahitaji hatua",
      description: "Submit a payment reference or contact support to reactivate the shop.",
      descriptionSw: "Weka payment reference au wasiliana na support ili kuamsha duka.",
      href: "/billing",
      count: 1,
    });
  }

  res.json({ items, unreadCount: items.length, generatedAt: new Date().toISOString() });
});

module.exports = { list };
