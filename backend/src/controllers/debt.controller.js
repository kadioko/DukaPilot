const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { normalizePhone } = require("../lib/phone");
const { findOpenCashSession } = require("../lib/cashSession");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function nextStatus(amount, amountPaid) {
  if (amountPaid <= 0) return "OPEN";
  if (amountPaid >= amount) return "PAID";
  return "PARTIAL";
}

const PAYMENT_METHODS = new Set(["CASH", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "HALOPESA", "BANK"]);

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const status = String(req.query.status || "").toUpperCase();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 50), 100);
  const where = { shopId };
  if (["OPEN", "PARTIAL", "PAID", "CANCELLED"].includes(status)) where.status = status;

  const [debts, total, summary] = await Promise.all([
    prisma.debt.findMany({
      where,
      include: { payments: { orderBy: { createdAt: "desc" }, take: 10 } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.debt.count({ where }),
    prisma.debt.aggregate({
      where: { shopId, status: { in: ["OPEN", "PARTIAL"] } },
      _sum: { amount: true, amountPaid: true },
      _count: { id: true },
    }),
  ]);

  res.json({
    debts,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    summary: {
      openCount: summary._count.id,
      totalOwed: (summary._sum.amount || 0) - (summary._sum.amountPaid || 0),
    },
  });
});

const customers = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 200), 500);
  const search = String(req.query.search || "").trim();
  const where = { shopId };
  if (search) {
    where.OR = [
      { customerName: { contains: search, mode: "insensitive" } },
      { customerPhone: { contains: search.replace(/\D/g, "") } },
    ];
  }
  const debts = await prisma.debt.findMany({
    where,
    select: { customerName: true, customerPhone: true, amount: true, amountPaid: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const customerMap = new Map();
  for (const debt of debts) {
    const phone = normalizePhone(debt.customerPhone);
    if (!phone) continue;
    const existing = customerMap.get(phone) || {
      name: debt.customerName || "",
      phone,
      openBalance: 0,
      lastSaleAt: debt.createdAt,
    };
    if (!existing.name && debt.customerName) existing.name = debt.customerName;
    if (["OPEN", "PARTIAL"].includes(debt.status)) existing.openBalance += debt.amount - debt.amountPaid;
    customerMap.set(phone, existing);
  }
  res.json({ customers: Array.from(customerMap.values()), limited: debts.length === limit });
});

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const amount = Number(req.body.amount);
  const amountPaid = Number(req.body.amountPaid || 0);
  const customerPhone = normalizePhone(req.body.customerPhone);

  if (!customerPhone || !Number.isInteger(amount) || amount <= 0 || !Number.isInteger(amountPaid) || amountPaid < 0) {
    return res.status(400).json({ error: "Customer phone and a whole positive TZS amount are required" });
  }
  const openingPayment = Math.min(amount, amountPaid);

  const debt = await prisma.$transaction(async (tx) => {
    const created = await tx.debt.create({
      data: {
        customerName: String(req.body.customerName || "").trim() || null,
        customerPhone,
        amount,
        amountPaid: openingPayment,
        status: nextStatus(amount, openingPayment),
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
        note: String(req.body.note || "").trim() || null,
        shopId,
      },
    });
    if (openingPayment > 0) {
      await tx.debtPayment.create({
        data: { debtId: created.id, amount: openingPayment, note: "Opening payment", recordedBy: req.user.userId },
      });
    }
    return created;
  });

  req.audit = { action: "debt.create", resourceType: "debt", resourceId: debt.id };
  res.status(201).json({ debt });
});

const recordPayment = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const amount = Number(req.body.amount);
  const paymentMethod = String(req.body.paymentMethod || "CASH").toUpperCase();
  const paymentRef = String(req.body.paymentRef || "").trim() || null;
  const note = String(req.body.note || "").trim() || null;

  if (!Number.isInteger(amount) || amount <= 0) {
    return res.status(400).json({ error: "Payment amount must be a whole positive TZS amount" });
  }
  if (!PAYMENT_METHODS.has(paymentMethod)) return res.status(400).json({ error: "Invalid payment method" });

  const updated = await prisma.$transaction(async (tx) => {
    const debt = await tx.debt.findFirst({ where: { id: req.params.id, shopId } });
    if (!debt) throw Object.assign(new Error("Debt not found"), { status: 404 });
    if (["PAID", "CANCELLED"].includes(debt.status)) {
      throw Object.assign(new Error("This debt can no longer receive payments"), { status: 400 });
    }

    const balance = debt.amount - debt.amountPaid;
    if (amount > balance) throw Object.assign(new Error(`Payment exceeds the remaining balance of ${balance} TZS`), { status: 400 });

    const amountPaid = debt.amountPaid + amount;
    const guarded = await tx.debt.updateMany({
      where: { id: debt.id, shopId, amountPaid: debt.amountPaid },
      data: { amountPaid, status: nextStatus(debt.amount, amountPaid) },
    });
    if (guarded.count !== 1) {
      throw Object.assign(new Error("Debt changed before this payment was saved. Refresh and try again."), { status: 409 });
    }

    const cashSession = paymentMethod === "CASH" ? await findOpenCashSession(tx, shopId, req.user) : null;
    await tx.debtPayment.create({
      data: { debtId: debt.id, amount, paymentMethod, paymentRef, note, recordedBy: req.user.staffId || req.user.userId, cashSessionId: cashSession?.id || null },
    });
    return tx.debt.findUnique({
      where: { id: debt.id },
      include: { payments: { orderBy: { createdAt: "desc" }, take: 10 } },
    });
  });

  req.audit = { action: "debt.payment", resourceType: "debt", resourceId: updated.id, metadata: { amount, paymentMethod, paymentRef } };
  res.json({ debt: updated });
});

const update = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const debt = await prisma.debt.findFirst({ where: { id: req.params.id, shopId } });
  if (!debt) return res.status(404).json({ error: "Debt not found" });

  const amount = req.body.amount == null ? debt.amount : Number(req.body.amount);
  if (req.body.amountPaid !== undefined && Number(req.body.amountPaid) !== debt.amountPaid) {
    return res.status(400).json({ error: "Use the payment action to change amount paid" });
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount < debt.amountPaid) {
    return res.status(400).json({ error: "Amount must be a whole TZS amount and cannot be below payments already recorded" });
  }

  const customerPhone = req.body.customerPhone === undefined ? debt.customerPhone : normalizePhone(req.body.customerPhone);
  if (!customerPhone) return res.status(400).json({ error: "Customer phone is required" });

  const status = req.body.status && ["OPEN", "PARTIAL", "PAID", "CANCELLED"].includes(String(req.body.status).toUpperCase())
    ? String(req.body.status).toUpperCase()
    : nextStatus(amount, debt.amountPaid);

  const updated = await prisma.debt.update({
    where: { id: debt.id },
    data: {
      customerName: req.body.customerName === undefined ? debt.customerName : String(req.body.customerName || "").trim() || null,
      customerPhone,
      amount,
      amountPaid: debt.amountPaid,
      status,
      dueDate: req.body.dueDate === undefined ? debt.dueDate : req.body.dueDate ? new Date(req.body.dueDate) : null,
      note: req.body.note === undefined ? debt.note : String(req.body.note || "").trim() || null,
    },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 10 } },
  });

  req.audit = { action: "debt.update", resourceType: "debt", resourceId: debt.id };
  res.json({ debt: updated });
});

const remove = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const debt = await prisma.debt.findFirst({
    where: { id: req.params.id, shopId },
    select: { id: true, saleId: true, amountPaid: true, _count: { select: { payments: true } } },
  });
  if (!debt) return res.status(404).json({ error: "Debt not found" });
  if (debt.saleId) {
    return res.status(409).json({ error: "This debt belongs to a sale. Void the sale from Sales History so stock and reports are corrected together." });
  }
  if (debt.amountPaid > 0 || debt._count.payments > 0) {
    return res.status(409).json({ error: "A debt with recorded payments cannot be deleted because its payment history must be preserved." });
  }

  const deleted = await prisma.debt.deleteMany({
    where: { id: debt.id, shopId, saleId: null, amountPaid: 0, payments: { none: {} } },
  });
  if (deleted.count !== 1) {
    return res.status(409).json({ error: "This debt changed before it could be deleted. Refresh and try again." });
  }

  req.audit = { action: "debt.delete", resourceType: "debt", resourceId: debt.id, metadata: { reason: "manual_entry_correction" } };
  res.json({ message: "Debt deleted" });
});

module.exports = { list, customers, create, recordPayment, update, remove };
