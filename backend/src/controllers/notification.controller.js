const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { isSubscriptionActive } = require("../middleware/subscription");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const permissions = req.user.staffId ? req.user.permissions || {} : {
    canSell: true,
    canManageStock: true,
    canManageStaff: true,
    canViewReports: true,
  };

  const [shop, products, debts, customerOrders, syncFailures] = await Promise.all([
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
  ]);

  const items = [];
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
      href: "/inventory?lowStock=true",
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
