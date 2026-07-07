const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function normalizePhone(value) {
  return String(value || "").replace(/[\s()-]/g, "").trim();
}

function nextStatus(amount, amountPaid) {
  if (amountPaid <= 0) return "OPEN";
  if (amountPaid >= amount) return "PAID";
  return "PARTIAL";
}

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const status = String(req.query.status || "").toUpperCase();
  const where = { shopId };
  if (["OPEN", "PARTIAL", "PAID", "CANCELLED"].includes(status)) where.status = status;

  const [debts, summary] = await Promise.all([
    prisma.debt.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }] }),
    prisma.debt.aggregate({
      where: { shopId, status: { in: ["OPEN", "PARTIAL"] } },
      _sum: { amount: true, amountPaid: true },
      _count: { id: true },
    }),
  ]);

  res.json({
    debts,
    summary: {
      openCount: summary._count.id,
      totalOwed: (summary._sum.amount || 0) - (summary._sum.amountPaid || 0),
    },
  });
});

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const amount = Number(req.body.amount);
  const amountPaid = Number(req.body.amountPaid || 0);
  const customerPhone = normalizePhone(req.body.customerPhone);

  if (!customerPhone || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "Customer phone and a positive amount are required" });
  }
  const clampedAmountPaid = Math.min(amount, Math.max(0, amountPaid));

  const debt = await prisma.debt.create({
    data: {
      customerName: String(req.body.customerName || "").trim() || null,
      customerPhone,
      amount,
      amountPaid: clampedAmountPaid,
      status: nextStatus(amount, clampedAmountPaid),
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
      note: String(req.body.note || "").trim() || null,
      shopId,
    },
  });

  req.audit = { action: "debt.create", resourceType: "debt", resourceId: debt.id };
  res.status(201).json({ debt });
});

const recordPayment = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const payment = Number(req.body.amount);
  if (!Number.isFinite(payment) || payment <= 0) {
    return res.status(400).json({ error: "Payment amount must be positive" });
  }

  const debt = await prisma.debt.findFirst({ where: { id: req.params.id, shopId } });
  if (!debt) return res.status(404).json({ error: "Debt not found" });

  const amountPaid = Math.min(debt.amount, debt.amountPaid + payment);
  const updated = await prisma.debt.update({
    where: { id: debt.id },
    data: { amountPaid, status: nextStatus(debt.amount, amountPaid) },
  });

  req.audit = { action: "debt.payment", resourceType: "debt", resourceId: debt.id, metadata: { payment } };
  res.json({ debt: updated });
});

const update = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const debt = await prisma.debt.findFirst({ where: { id: req.params.id, shopId } });
  if (!debt) return res.status(404).json({ error: "Debt not found" });

  const amount = req.body.amount == null ? debt.amount : Number(req.body.amount);
  const amountPaid = req.body.amountPaid == null ? debt.amountPaid : Number(req.body.amountPaid);
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(amountPaid) || amountPaid < 0) {
    return res.status(400).json({ error: "Valid amount and amount paid are required" });
  }

  const status = req.body.status && ["OPEN", "PARTIAL", "PAID", "CANCELLED"].includes(String(req.body.status).toUpperCase())
    ? String(req.body.status).toUpperCase()
    : nextStatus(amount, amountPaid);

  const updated = await prisma.debt.update({
    where: { id: debt.id },
    data: {
      customerName: req.body.customerName === undefined ? debt.customerName : String(req.body.customerName || "").trim() || null,
      customerPhone: req.body.customerPhone === undefined ? debt.customerPhone : normalizePhone(req.body.customerPhone),
      amount,
      amountPaid: Math.min(amount, amountPaid),
      status,
      dueDate: req.body.dueDate === undefined ? debt.dueDate : req.body.dueDate ? new Date(req.body.dueDate) : null,
      note: req.body.note === undefined ? debt.note : String(req.body.note || "").trim() || null,
    },
  });

  req.audit = { action: "debt.update", resourceType: "debt", resourceId: debt.id };
  res.json({ debt: updated });
});

module.exports = { list, create, recordPayment, update };
