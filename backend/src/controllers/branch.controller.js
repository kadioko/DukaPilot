const crypto = require("node:crypto");
const prisma = require("../lib/prisma");
const { getBillingShopIdForUser, getShopIdForUser } = require("../lib/shopAccess");
const { activePlan, branchLimit } = require("../lib/entitlements");
const { resolveShopContactPhone, normalizeShopContactPhone } = require("../lib/shopContact");
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const select = { id: true, name: true, location: true, contactPhone: true, district: true, parentShopId: true, branchArchived: true, isActive: true, createdAt: true };

function parseTanzaniaDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return new Date(utc - 3 * 60 * 60 * 1000);
}

function parseTanzaniaRange(fromInput, toInput) {
  const from = parseTanzaniaDate(fromInput);
  const toDate = parseTanzaniaDate(toInput);
  if (!from || !toDate || toDate < from) fail("Choose a valid date range");
  const to = new Date(toDate.getTime() + 86400000);
  if (+to - +from > 366 * 86400000) fail("Choose a date range of up to one year");
  return { from, to };
}

function ownerOnly(req, res, next) {
  if (req.user.staffId || req.user.role !== "MERCHANT") return res.status(403).json({ error: "Only the business owner can manage branches" });
  next();
}

const list = wrap(async (req, res) => {
  const rootId = await getBillingShopIdForUser(req.user);
  const root = await prisma.shop.findUnique({ where: { id: rootId }, include: { user: { select: { phone: true } } } });
  const branches = await prisma.shop.findMany({ where: { OR: [{ id: rootId }, { parentShopId: rootId }] }, select, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const locations = branches.map((branch) => ({ ...branch, effectiveContactPhone: resolveShopContactPhone({ ...branch, user: branch.id === rootId ? root.user : null, parentShop: branch.id === rootId ? null : root }) }));
  res.json({ branches: locations, selectedId: await getShopIdForUser(req.user), mainId: rootId, pro: activePlan(root) === "PRO", limit: branchLimit(root), extraBranches: root.additionalBranchSlots, monthlyAmount: root.plan === "PRO" ? 35000 + 10000 * root.additionalBranchSlots : 15000 });
});

const create = wrap(async (req, res) => {
  const rootId = await getBillingShopIdForUser(req.user);
  const name = String(req.body.name || "").trim();
  const location = String(req.body.location || "").trim();
  const contactPhone = normalizeShopContactPhone(req.body.contactPhone);
  if (!name || name.length > 100 || !location || location.length > 200) fail("Enter a branch name and location (maximum 100 and 200 characters).");
  const branch = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM shops WHERE id = ${rootId} FOR UPDATE`;
    const root = await tx.shop.findUnique({ where: { id: rootId } });
    if (activePlan(root) !== "PRO") fail("Branches require an active Pro subscription", 403);
    const count = await tx.shop.count({ where: { parentShopId: rootId, branchArchived: false } });
    if (count + 1 >= branchLimit(root)) fail("Branch limit reached. Pay for another branch in Billing first.", 403);
    if (await tx.shop.findFirst({ where: { OR: [{ id: rootId }, { parentShopId: rootId }], name: { equals: name, mode: "insensitive" } } })) fail("A branch with this name already exists", 409);
    return tx.shop.create({ data: { parentShopId: rootId, name, location, contactPhone, category: root.category, plan: root.plan, subscriptionEndsAt: root.subscriptionEndsAt, isActive: root.isActive, isCatalogPublished: false, referralCode: crypto.randomBytes(16).toString("hex") }, select });
  });
  req.audit = { action: "branch.create", resourceType: "shop", resourceId: branch.id };
  res.status(201).json({ branch });
});

const update = wrap(async (req, res) => {
  const rootId = await getBillingShopIdForUser(req.user);
  const branch = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM shops WHERE id = ${rootId} FOR UPDATE`;
    const current = await tx.shop.findFirst({ where: { id: req.params.id, OR: [{ id: rootId }, { parentShopId: rootId }] } });
    if (!current) fail("Business location not found", 404);
    const isMain = current.id === rootId;
    const data = {};
    if (req.body.name !== undefined) {
      if (isMain) fail("Update the main business name in Settings");
      const name = String(req.body.name).trim();
      if (!name || name.length > 100) fail("Invalid branch name");
      if (await tx.shop.findFirst({ where: { id: { not: current.id }, OR: [{ id: rootId }, { parentShopId: rootId }], name: { equals: name, mode: "insensitive" } } })) fail("A branch with this name already exists", 409);
      data.name = name;
    }
    if (req.body.branchArchived !== undefined) {
      if (isMain) fail("The main shop cannot be archived");
      if (typeof req.body.branchArchived !== "boolean") fail("Invalid archive option");
      const root = await tx.shop.findUnique({ where: { id: rootId } });
      if (!req.body.branchArchived && current.branchArchived) {
        if (activePlan(root) !== "PRO") fail("Branches require an active Pro subscription", 403);
        const count = await tx.shop.count({ where: { parentShopId: rootId, branchArchived: false } });
        if (count + 1 >= branchLimit(root)) fail("Branch limit reached", 403);
      }
      if (req.body.branchArchived && await tx.cashSession.findFirst({ where: { shopId: current.id, status: "OPEN" } })) fail("Close the branch's Daily Close sessions before archiving", 409);
      data.branchArchived = req.body.branchArchived;
      data.isActive = !data.branchArchived && activePlan(root) === "PRO";
      if (data.branchArchived) data.isCatalogPublished = false;
    }
    if (req.body.contactPhone !== undefined) data.contactPhone = normalizeShopContactPhone(req.body.contactPhone);
    if (!Object.keys(data).length) fail("No changes supplied");
    return tx.shop.update({ where: { id: current.id }, data, select });
  });
  req.audit = { action: "branch.update", resourceType: "shop", resourceId: branch.id, metadata: { archived: branch.branchArchived } };
  res.json({ branch });
});

const overview = wrap(async (req, res) => {
  const rootId = await getBillingShopIdForUser(req.user);
  const root = await prisma.shop.findUnique({ where: { id: rootId } });
  if (activePlan(root) !== "PRO") fail("Combined branch reports require Pro", 403);
  const today = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const defaultFrom = `${today.slice(0, 7)}-01`;
  const fromInput = String(req.query.from || defaultFrom);
  const toInput = String(req.query.to || today);
  const { from, to } = parseTanzaniaRange(fromInput, toInput);
  const branches = await prisma.shop.findMany({ where: { OR: [{ id: rootId }, { parentShopId: rootId }] }, select, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const shopIds = branches.map((b) => b.id);
  const shopPlaceholders = shopIds.map((_, index) => `$${index + 1}`).join(", ");
  const fromParam = shopIds.length + 1;
  const toParam = shopIds.length + 2;
  const rangeDuration = to.getTime() - from.getTime();
  const previousRange = { from: new Date(from.getTime() - rangeDuration), to: from };
  const [sales, expenseGroups, debts, saleCosts, previousSales, previousExpenses, previousCosts] = await Promise.all([
    prisma.sale.groupBy({ by: ["shopId"], where: { shopId: { in: shopIds }, status: "COMPLETED", createdAt: { gte: from, lt: to } }, _sum: { totalAmount: true, profit: true }, _count: { _all: true } }),
    prisma.expense.groupBy({ by: ["shopId"], where: { shopId: { in: shopIds }, spentAt: { gte: from, lt: to }, category: { not: "STOCK" } }, _sum: { amount: true } }),
    prisma.debt.groupBy({ by: ["shopId"], where: { shopId: { in: shopIds }, status: { in: ["OPEN", "PARTIAL"] } }, _sum: { amount: true, amountPaid: true } }),
    prisma.$queryRawUnsafe(
      `SELECT s.\"shopId\",
              COALESCE(SUM(si.\"totalPrice\" - si.\"buyingPrice\" * si.quantity) FILTER (WHERE si.\"buyingPrice\" > 0), 0)::bigint AS \"knownCostGrossProfit\",
              COALESCE(SUM(CASE WHEN si.id IS NULL THEN s.\"totalAmount\" WHEN si.\"buyingPrice\" <= 0 THEN si.\"totalPrice\" ELSE 0 END), 0)::bigint AS \"missingCostSalesRevenue\"
       FROM sales s LEFT JOIN sale_items si ON si.\"saleId\" = s.id
       WHERE s.\"shopId\" IN (${shopPlaceholders}) AND s.status = 'COMPLETED' AND s.\"createdAt\" >= $${fromParam} AND s.\"createdAt\" < $${toParam}
       GROUP BY s.\"shopId\"`,
      ...shopIds, from, to,
    ),
    prisma.sale.groupBy({ by: ["shopId"], where: { shopId: { in: shopIds }, status: "COMPLETED", createdAt: { gte: previousRange.from, lt: previousRange.to } }, _sum: { totalAmount: true }, _count: { _all: true } }),
    prisma.expense.groupBy({ by: ["shopId"], where: { shopId: { in: shopIds }, spentAt: { gte: previousRange.from, lt: previousRange.to }, category: { not: "STOCK" } }, _sum: { amount: true } }),
    prisma.$queryRawUnsafe(
      `SELECT s.\"shopId\",
              COALESCE(SUM(si.\"totalPrice\" - si.\"buyingPrice\" * si.quantity) FILTER (WHERE si.\"buyingPrice\" > 0), 0)::bigint AS \"knownCostGrossProfit\"
       FROM sales s JOIN sale_items si ON si.\"saleId\" = s.id
       WHERE s.\"shopId\" IN (${shopPlaceholders}) AND s.status = 'COMPLETED' AND s.\"createdAt\" >= $${fromParam} AND s.\"createdAt\" < $${toParam}
       GROUP BY s.\"shopId\"`,
      ...shopIds, previousRange.from, previousRange.to,
    ),
  ]);
  const rows = branches.map((b) => {
    const s = sales.find((row) => row.shopId === b.id), e = expenseGroups.find((row) => row.shopId === b.id), d = debts.find((row) => row.shopId === b.id), costs = saleCosts.find((row) => row.shopId === b.id);
    const previousSale = previousSales.find((row) => row.shopId === b.id), previousExpense = previousExpenses.find((row) => row.shopId === b.id), previousCost = previousCosts.find((row) => row.shopId === b.id);
    const grossProfit = Number(costs?.knownCostGrossProfit || 0);
    const expenses = e?._sum.amount || 0;
    const previousGrossProfit = Number(previousCost?.knownCostGrossProfit || 0);
    const previousExpensesAmount = Number(previousExpense?._sum.amount || 0);
    return {
      ...b,
      sales: s?._sum.totalAmount || 0,
      saleCount: s?._count._all || 0,
      grossProfit,
      missingCostSalesRevenue: Number(costs?.missingCostSalesRevenue || 0),
      expenses,
      netProfit: grossProfit - expenses,
      receivables: (d?._sum.amount || 0) - (d?._sum.amountPaid || 0),
      previousSales: Number(previousSale?._sum.totalAmount || 0),
      previousSaleCount: Number(previousSale?._count._all || 0),
      previousGrossProfit,
      previousExpenses: previousExpensesAmount,
      previousNetProfit: previousGrossProfit - previousExpensesAmount,
    };
  });
  const previousTotals = {
    sales: previousSales.reduce((sum, row) => sum + Number(row._sum.totalAmount || 0), 0),
    saleCount: previousSales.reduce((sum, row) => sum + Number(row._count._all || 0), 0),
    grossProfit: previousCosts.reduce((sum, row) => sum + Number(row.knownCostGrossProfit || 0), 0),
    expenses: previousExpenses.reduce((sum, row) => sum + Number(row._sum.amount || 0), 0),
  };
  previousTotals.netProfit = previousTotals.grossProfit - previousTotals.expenses;
  const currentTotals = rows.reduce((total, row) => ({
    sales: total.sales + Number(row.sales), saleCount: total.saleCount + Number(row.saleCount),
    grossProfit: total.grossProfit + Number(row.grossProfit), expenses: total.expenses + Number(row.expenses),
    netProfit: total.netProfit + Number(row.netProfit), missingCostSalesRevenue: total.missingCostSalesRevenue + Number(row.missingCostSalesRevenue),
    receivables: total.receivables + Number(row.receivables),
  }), { sales: 0, saleCount: 0, grossProfit: 0, expenses: 0, netProfit: 0, missingCostSalesRevenue: 0, receivables: 0 });
  const comparison = Object.fromEntries(["sales", "saleCount", "grossProfit", "expenses", "netProfit"].map((key) => {
    const current = currentTotals[key], previous = previousTotals[key];
    return [key, { current, previous, change: current - previous, changePercent: previous === 0 ? null : Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1)) }];
  }));
  res.json({
    from: fromInput,
    to: toInput,
    branches: rows,
    compareFrom: previousRange.from,
    compareTo: previousRange.to,
    totals: currentTotals,
    previousTotals,
    comparison,
  });
});
module.exports = { ownerOnly, list, create, update, overview, parseTanzaniaDate, parseTanzaniaRange };
