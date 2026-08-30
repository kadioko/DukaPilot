const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { getRequestLanguage } = require("../lib/requestLanguage");
const { startOfTanzaniaDay, startOfTanzaniaWeek, startOfTanzaniaMonth, addTanzaniaMonths } = require("../lib/businessTime");
const { findOpenCashSession } = require("../lib/cashSession");
const { invalidateDashboardHistory } = require("../services/dashboard-cache.service");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const CATEGORIES = new Set(["RENT", "SALARY", "UTILITIES", "TRANSPORT", "MARKETING", "TAX", "OTHER"]);
const LEGACY_STOCK_CATEGORY = "STOCK";
const PAYMENT_METHODS = new Set(["CASH", "MPESA", "BANK"]);

function parseSpentAt(value, fallback) {
  if (value === undefined) return fallback;
  if (value === null || value === "") return null;

  const text = String(value).trim();
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const date = isDateOnly ? new Date(`${text}T12:00:00.000Z`) : new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  if (isDateOnly && date.toISOString().slice(0, 10) !== text) return null;
  return date;
}

function validationError(req, res, english, swahili, code = "EXPENSE_VALIDATION_ERROR") {
  return res.status(400).json({
    error: getRequestLanguage(req) === "sw" ? swahili : english,
    code,
  });
}

function parsePaymentMethod(value, fallback = "CASH") {
  const paymentMethod = String(value || fallback).toUpperCase();
  return PAYMENT_METHODS.has(paymentMethod) ? paymentMethod : null;
}

function advanceOneMonth(date) {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const daysInNextMonth = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, daysInNextMonth));
  return next;
}

function periodWindow(value, now = new Date()) {
  const period = String(value || "month").toLowerCase();
  if (period === "all") return { period, from: null, to: null, previousFrom: null, previousTo: null };

  let from;
  let to;
  let previousFrom;
  if (period === "today") {
    from = startOfTanzaniaDay(now);
    to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    previousFrom = new Date(from.getTime() - 24 * 60 * 60 * 1000);
  } else if (period === "week") {
    from = startOfTanzaniaWeek(now);
    to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
    previousFrom = new Date(from.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (period === "month") {
    from = startOfTanzaniaMonth(now);
    to = addTanzaniaMonths(from, 1);
    previousFrom = addTanzaniaMonths(from, -1);
  } else {
    return null;
  }
  return { period, from, to, previousFrom, previousTo: from };
}

function expenseDataFromRequest(req, fallback = {}) {
  const title = req.body.title === undefined && req.body.name === undefined
    ? fallback.title
    : String(req.body.title ?? req.body.name ?? "").trim();
  const amount = req.body.amount == null ? fallback.amount : Number(req.body.amount);
  const category = String(req.body.category || fallback.category || "OTHER").toUpperCase();
  const paymentMethod = parsePaymentMethod(req.body.paymentMethod, fallback.paymentMethod || "CASH");
  const spentAt = parseSpentAt(req.body.spentAt, fallback.spentAt || new Date());

  return {
    title,
    amount,
    category: category === LEGACY_STOCK_CATEGORY || CATEGORIES.has(category) ? category : "OTHER",
    vendor: req.body.vendor === undefined ? (fallback.vendor || null) : String(req.body.vendor || "").trim() || null,
    note: req.body.note === undefined ? (fallback.note || null) : String(req.body.note || "").trim() || null,
    paymentMethod,
    spentAt,
  };
}

function validateExpenseData(req, res, data) {
  if (data.category === LEGACY_STOCK_CATEGORY) {
    validationError(
      req,
      res,
      "Stock purchases are recorded through Inventory > Restock so they are not counted twice in profit.",
      "Ununuzi wa bidhaa rekodi kwenye Hifadhi ya Bidhaa > Ongeza stock ili usihesabiwe mara mbili kwenye faida.",
      "STOCK_PURCHASES_USE_INVENTORY",
    );
    return false;
  }
  if (!data.title || !Number.isInteger(data.amount) || data.amount <= 0) {
    validationError(
      req,
      res,
      "Expense name and a whole positive TZS amount are required",
      "Jina la matumizi na kiasi chanya cha TZS bila desimali vinahitajika",
    );
    return false;
  }
  if (!data.spentAt) {
    validationError(req, res, "Expense date is invalid", "Tarehe ya matumizi si sahihi", "INVALID_EXPENSE_DATE");
    return false;
  }
  if (!data.paymentMethod) {
    validationError(req, res, "Choose cash, M-Pesa, or bank", "Chagua Taslimu, M-Pesa, au Benki", "INVALID_EXPENSE_PAYMENT_METHOD");
    return false;
  }
  return true;
}

function recurringTemplateData(data) {
  const { spentAt, ...template } = data;
  return template;
}

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const window = periodWindow(req.query.period);
  if (!window) return validationError(req, res, "Period must be today, week, month, or all", "Kipindi kiwe Leo, Wiki, Mwezi, au Muda wote", "INVALID_EXPENSE_PERIOD");
  const category = String(req.query.category || "").toUpperCase();
  const search = String(req.query.search || "").trim().slice(0, 120);
  const vendor = String(req.query.vendor || "").trim().slice(0, 120);
  const from = req.query.from ? parseSpentAt(req.query.from, null) : null;
  const to = req.query.to ? parseSpentAt(req.query.to, null) : null;
  if (req.query.from && !from) return validationError(req, res, "Start date is invalid", "Tarehe ya kuanzia si sahihi", "INVALID_EXPENSE_FILTER_DATE");
  if (req.query.to && !to) return validationError(req, res, "End date is invalid", "Tarehe ya mwisho si sahihi", "INVALID_EXPENSE_FILTER_DATE");
  if (to) to.setUTCHours(23, 59, 59, 999);
  if (from && to && from > to) return validationError(req, res, "Start date must be before end date", "Tarehe ya kuanzia lazima iwe kabla ya tarehe ya mwisho", "INVALID_EXPENSE_FILTER_RANGE");
  if (category === LEGACY_STOCK_CATEGORY) return validationError(req, res, "Stock purchases are managed in Inventory, not Expenses", "Ununuzi wa bidhaa unasimamiwa kwenye Hifadhi ya Bidhaa, si Matumizi", "STOCK_PURCHASES_USE_INVENTORY");

  const filters = { shopId };
  if (CATEGORIES.has(category)) filters.category = category;
  if (vendor) filters.vendor = { contains: vendor, mode: "insensitive" };
  if (search) {
    filters.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { vendor: { contains: search, mode: "insensitive" } },
      { note: { contains: search, mode: "insensitive" } },
    ];
  }

  function expenseWhere(range, useExplicitDates = true) {
    const where = { ...filters, category: filters.category || { not: LEGACY_STOCK_CATEGORY } };
    if (useExplicitDates && (from || to)) {
      where.spentAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    } else if (range.from || range.to) {
      where.spentAt = { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: range.to } : {}) };
    }
    return where;
  }

  const where = expenseWhere(window);
  const previousWhere = !from && !to && window.previousFrom && window.previousTo
    ? expenseWhere({ from: window.previousFrom, to: window.previousTo }, false)
    : null;
  const salesWhere = { shopId, status: "COMPLETED" };
  if (window.from || window.to) salesWhere.createdAt = { ...(window.from ? { gte: window.from } : {}), ...(window.to ? { lt: window.to } : {}) };

  const [expenses, summary, recurringExpenses, sales, previousSummary, categoryBreakdown] = await Promise.all([
    prisma.expense.findMany({ where, orderBy: { spentAt: "desc" }, take: 100 }),
    prisma.expense.aggregate({ where, _sum: { amount: true }, _count: { id: true } }),
    prisma.recurringExpense.findMany({ where: { shopId, isActive: true, category: { not: LEGACY_STOCK_CATEGORY } }, orderBy: { nextDueAt: "asc" }, take: 20 }),
    prisma.sale.aggregate({ where: salesWhere, _sum: { totalAmount: true, profit: true }, _count: { id: true } }),
    previousWhere ? prisma.expense.aggregate({ where: previousWhere, _sum: { amount: true } }) : Promise.resolve(null),
    prisma.expense.groupBy({ by: ["category"], where, _sum: { amount: true }, orderBy: { _sum: { amount: "desc" } }, take: 3 }),
  ]);

  const total = summary._sum.amount || 0;
  const totalSales = sales._sum.totalAmount || 0;
  const grossProfit = sales._sum.profit || 0;
  const previousTotal = previousSummary?._sum.amount || 0;
  res.json({
    expenses,
    recurringExpenses,
    period: window.period,
    summary: {
      total,
      count: summary._count.id,
      totalSales,
      grossProfit,
      netProfit: grossProfit - total,
      expensePercentOfSales: totalSales > 0 ? (total / totalSales) * 100 : null,
      previousTotal: previousSummary ? previousTotal : null,
      changeAmount: previousSummary ? total - previousTotal : null,
      changePercent: previousSummary && previousTotal > 0 ? ((total - previousTotal) / previousTotal) * 100 : null,
      salesCount: sales._count.id,
      topCategories: categoryBreakdown.map((item) => ({ category: item.category, total: item._sum.amount || 0 })),
    },
  });
});

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const data = expenseDataFromRequest(req);
  if (!validateExpenseData(req, res, data)) return;

  const recurringMonthly = req.body.recurringMonthly === true;
  let result;
  if (!recurringMonthly && data.paymentMethod !== "CASH") {
    result = { expense: await prisma.expense.create({ data: { ...data, shopId, cashSessionId: null } }), recurringExpense: null };
  } else {
    result = await prisma.$transaction(async (tx) => {
      const cashSession = data.paymentMethod === "CASH" ? await findOpenCashSession(tx, shopId, req.user) : null;
      const expense = await tx.expense.create({ data: { ...data, shopId, cashSessionId: cashSession?.id || null } });
      if (recurringMonthly) {
      const recurringExpense = await tx.recurringExpense.create({
        data: { ...recurringTemplateData(data), nextDueAt: advanceOneMonth(data.spentAt), shopId },
      });
      return { expense, recurringExpense };
      }
      return { expense, recurringExpense: null };
    });
  }

  await invalidateDashboardHistory(shopId);
  req.audit = { action: "expense.create", resourceType: "expense", resourceId: result.expense.id, metadata: { recurringMonthly } };
  res.status(201).json(result);
});

const update = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await prisma.expense.findFirst({ where: { id: req.params.id, shopId } });
  if (!existing) return res.status(404).json({ error: "Expense not found" });

  const data = expenseDataFromRequest(req, existing);
  if (!validateExpenseData(req, res, data)) return;

  const expense = await prisma.expense.update({
    where: { id: existing.id },
    data,
  });

  await invalidateDashboardHistory(shopId);
  req.audit = { action: "expense.update", resourceType: "expense", resourceId: expense.id };
  res.json({ expense });
});

const recordRecurring = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const result = await prisma.$transaction(async (tx) => {
    const recurringExpense = await tx.recurringExpense.findFirst({ where: { id: req.params.id, shopId, isActive: true } });
    if (!recurringExpense) throw Object.assign(new Error("Recurring expense not found"), { status: 404 });
    if (recurringExpense.category === LEGACY_STOCK_CATEGORY) {
      throw Object.assign(new Error("Stock purchases are managed in Inventory, not Expenses"), { status: 409 });
    }
    const spentAt = parseSpentAt(req.body.spentAt, recurringExpense.nextDueAt);
    if (!spentAt) throw Object.assign(new Error("Expense date is invalid"), { status: 400 });
    const cashSession = recurringExpense.paymentMethod === "CASH" ? await findOpenCashSession(tx, shopId, req.user) : null;
    const expense = await tx.expense.create({
      data: {
        title: recurringExpense.title,
        amount: recurringExpense.amount,
        category: recurringExpense.category,
        vendor: recurringExpense.vendor,
        note: recurringExpense.note,
        paymentMethod: recurringExpense.paymentMethod,
        spentAt,
        shopId,
        cashSessionId: cashSession?.id || null,
      },
    });
    const nextDueAt = advanceOneMonth(recurringExpense.nextDueAt);
    await tx.recurringExpense.update({ where: { id: recurringExpense.id }, data: { nextDueAt } });
    return { expense, nextDueAt };
  });
  await invalidateDashboardHistory(shopId);
  req.audit = { action: "expense.recurring.record", resourceType: "expense", resourceId: result.expense.id, metadata: { recurringExpenseId: req.params.id } };
  res.status(201).json(result);
});

const removeRecurring = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const updated = await prisma.recurringExpense.updateMany({ where: { id: req.params.id, shopId, isActive: true }, data: { isActive: false } });
  if (updated.count !== 1) return res.status(404).json({ error: "Recurring expense not found" });
  req.audit = { action: "expense.recurring.cancel", resourceType: "recurring_expense", resourceId: req.params.id };
  res.json({ message: "Recurring expense cancelled" });
});

const remove = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await prisma.expense.findFirst({ where: { id: req.params.id, shopId } });
  if (!existing) return res.status(404).json({ error: "Expense not found" });
  await prisma.expense.delete({ where: { id: existing.id } });
  await invalidateDashboardHistory(shopId);
  req.audit = { action: "expense.delete", resourceType: "expense", resourceId: existing.id };
  res.json({ message: "Expense deleted" });
});

module.exports = { list, create, update, remove, recordRecurring, removeRecurring };
