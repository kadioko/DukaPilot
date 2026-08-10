const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { getRequestLanguage } = require("../lib/requestLanguage");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const CATEGORIES = new Set(["RENT", "SALARY", "UTILITIES", "TRANSPORT", "STOCK", "MARKETING", "TAX", "OTHER"]);
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
    category: CATEGORIES.has(category) ? category : "OTHER",
    vendor: req.body.vendor === undefined ? (fallback.vendor || null) : String(req.body.vendor || "").trim() || null,
    note: req.body.note === undefined ? (fallback.note || null) : String(req.body.note || "").trim() || null,
    paymentMethod,
    spentAt,
  };
}

function validateExpenseData(req, res, data) {
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
  const category = String(req.query.category || "").toUpperCase();
  const search = String(req.query.search || "").trim().slice(0, 120);
  const vendor = String(req.query.vendor || "").trim().slice(0, 120);
  const from = req.query.from ? parseSpentAt(req.query.from, null) : null;
  const to = req.query.to ? parseSpentAt(req.query.to, null) : null;
  if (req.query.from && !from) return validationError(req, res, "Start date is invalid", "Tarehe ya kuanzia si sahihi", "INVALID_EXPENSE_FILTER_DATE");
  if (req.query.to && !to) return validationError(req, res, "End date is invalid", "Tarehe ya mwisho si sahihi", "INVALID_EXPENSE_FILTER_DATE");
  if (to) to.setUTCHours(23, 59, 59, 999);
  if (from && to && from > to) return validationError(req, res, "Start date must be before end date", "Tarehe ya kuanzia lazima iwe kabla ya tarehe ya mwisho", "INVALID_EXPENSE_FILTER_RANGE");
  const where = { shopId };
  if (CATEGORIES.has(category)) where.category = category;
  if (from || to) where.spentAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  if (vendor) where.vendor = { contains: vendor, mode: "insensitive" };
  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { vendor: { contains: search, mode: "insensitive" } },
      { note: { contains: search, mode: "insensitive" } },
    ];
  }

  const [expenses, summary, recurringExpenses] = await Promise.all([
    prisma.expense.findMany({ where, orderBy: { spentAt: "desc" }, take: 100 }),
    prisma.expense.aggregate({ where, _sum: { amount: true }, _count: { id: true } }),
    prisma.recurringExpense.findMany({ where: { shopId, isActive: true }, orderBy: { nextDueAt: "asc" }, take: 20 }),
  ]);

  res.json({ expenses, recurringExpenses, summary: { total: summary._sum.amount || 0, count: summary._count.id } });
});

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const data = expenseDataFromRequest(req);
  if (!validateExpenseData(req, res, data)) return;

  const recurringMonthly = req.body.recurringMonthly === true;
  const result = recurringMonthly
    ? await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({ data: { ...data, shopId } });
      const recurringExpense = await tx.recurringExpense.create({
        data: { ...recurringTemplateData(data), nextDueAt: advanceOneMonth(data.spentAt), shopId },
      });
      return { expense, recurringExpense };
    })
    : { expense: await prisma.expense.create({ data: { ...data, shopId } }), recurringExpense: null };

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

  req.audit = { action: "expense.update", resourceType: "expense", resourceId: expense.id };
  res.json({ expense });
});

const recordRecurring = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const result = await prisma.$transaction(async (tx) => {
    const recurringExpense = await tx.recurringExpense.findFirst({ where: { id: req.params.id, shopId, isActive: true } });
    if (!recurringExpense) throw Object.assign(new Error("Recurring expense not found"), { status: 404 });
    const spentAt = parseSpentAt(req.body.spentAt, recurringExpense.nextDueAt);
    if (!spentAt) throw Object.assign(new Error("Expense date is invalid"), { status: 400 });
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
      },
    });
    const nextDueAt = advanceOneMonth(recurringExpense.nextDueAt);
    await tx.recurringExpense.update({ where: { id: recurringExpense.id }, data: { nextDueAt } });
    return { expense, nextDueAt };
  });
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
  req.audit = { action: "expense.delete", resourceType: "expense", resourceId: existing.id };
  res.json({ message: "Expense deleted" });
});

module.exports = { list, create, update, remove, recordRecurring, removeRecurring };
