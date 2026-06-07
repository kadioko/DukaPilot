const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const CATEGORIES = new Set(["RENT", "SALARY", "UTILITIES", "TRANSPORT", "STOCK", "MARKETING", "TAX", "OTHER"]);

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
  const title = String(req.body.title || "").trim();
  const amount = Number(req.body.amount);
  const category = String(req.body.category || "OTHER").toUpperCase();

  if (!title || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "Title and a positive amount are required" });
  }

  const expense = await prisma.expense.create({
    data: {
      title,
      amount,
      category: CATEGORIES.has(category) ? category : "OTHER",
      vendor: String(req.body.vendor || "").trim() || null,
      note: String(req.body.note || "").trim() || null,
      spentAt: req.body.spentAt ? new Date(req.body.spentAt) : new Date(),
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
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Amount must be positive" });

  const expense = await prisma.expense.update({
    where: { id: existing.id },
    data: {
      title: req.body.title === undefined ? existing.title : String(req.body.title || "").trim(),
      amount,
      category: CATEGORIES.has(category) ? category : existing.category,
      vendor: req.body.vendor === undefined ? existing.vendor : String(req.body.vendor || "").trim() || null,
      note: req.body.note === undefined ? existing.note : String(req.body.note || "").trim() || null,
      spentAt: req.body.spentAt === undefined ? existing.spentAt : req.body.spentAt ? new Date(req.body.spentAt) : existing.spentAt,
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
