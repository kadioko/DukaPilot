const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { getRequestLanguage } = require("../lib/requestLanguage");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const CATEGORIES = new Set(["RENT", "SALARY", "UTILITIES", "TRANSPORT", "STOCK", "MARKETING", "TAX", "OTHER"]);

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

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const category = String(req.query.category || "").toUpperCase();
  const where = { shopId };
  if (CATEGORIES.has(category)) where.category = category;

  const [expenses, summary] = await Promise.all([
    prisma.expense.findMany({ where, orderBy: { spentAt: "desc" }, take: 100 }),
    prisma.expense.aggregate({ where, _sum: { amount: true }, _count: { id: true } }),
  ]);

  res.json({ expenses, summary: { total: summary._sum.amount || 0, count: summary._count.id } });
});

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const title = String(req.body.title ?? req.body.name ?? "").trim();
  const amount = Number(req.body.amount);
  const category = String(req.body.category || "OTHER").toUpperCase();
  const spentAt = parseSpentAt(req.body.spentAt, new Date());

  if (!title || !Number.isInteger(amount) || amount <= 0) {
    return validationError(
      req,
      res,
      "Expense name and a whole positive TZS amount are required",
      "Jina la matumizi na kiasi chanya cha TZS bila desimali vinahitajika",
    );
  }
  if (!spentAt) {
    return validationError(req, res, "Expense date is invalid", "Tarehe ya matumizi si sahihi", "INVALID_EXPENSE_DATE");
  }

  const expense = await prisma.expense.create({
    data: {
      title,
      amount,
      category: CATEGORIES.has(category) ? category : "OTHER",
      vendor: String(req.body.vendor || "").trim() || null,
      note: String(req.body.note || "").trim() || null,
      spentAt,
      shopId,
    },
  });

  req.audit = { action: "expense.create", resourceType: "expense", resourceId: expense.id };
  res.status(201).json({ expense });
});

const update = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await prisma.expense.findFirst({ where: { id: req.params.id, shopId } });
  if (!existing) return res.status(404).json({ error: "Expense not found" });

  const amount = req.body.amount == null ? existing.amount : Number(req.body.amount);
  const category = String(req.body.category || existing.category).toUpperCase();
  const spentAt = parseSpentAt(req.body.spentAt, existing.spentAt);
  const nextTitle = req.body.title === undefined && req.body.name === undefined
    ? existing.title
    : String(req.body.title ?? req.body.name ?? "").trim();
  if (!nextTitle || !Number.isInteger(amount) || amount <= 0) {
    return validationError(
      req,
      res,
      "Expense name and a whole positive TZS amount are required",
      "Jina la matumizi na kiasi chanya cha TZS bila desimali vinahitajika",
    );
  }
  if (!spentAt) {
    return validationError(req, res, "Expense date is invalid", "Tarehe ya matumizi si sahihi", "INVALID_EXPENSE_DATE");
  }

  const expense = await prisma.expense.update({
    where: { id: existing.id },
    data: {
      title: nextTitle,
      amount,
      category: CATEGORIES.has(category) ? category : existing.category,
      vendor: req.body.vendor === undefined ? existing.vendor : String(req.body.vendor || "").trim() || null,
      note: req.body.note === undefined ? existing.note : String(req.body.note || "").trim() || null,
      spentAt,
    },
  });

  req.audit = { action: "expense.update", resourceType: "expense", resourceId: expense.id };
  res.json({ expense });
});

const remove = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await prisma.expense.findFirst({ where: { id: req.params.id, shopId } });
  if (!existing) return res.status(404).json({ error: "Expense not found" });
  await prisma.expense.delete({ where: { id: existing.id } });
  req.audit = { action: "expense.delete", resourceType: "expense", resourceId: existing.id };
  res.json({ message: "Expense deleted" });
});

module.exports = { list, create, update, remove };
