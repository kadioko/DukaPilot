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

const PAYMENT_METHODS = new Set(["CASH", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "HALOPESA", "BANK"]);

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const status = String(req.query.status || "").toUpperCase();
  const where = { shopId };
  if (["OPEN", "PARTIAL", "PAID", "CANCELLED"].includes(status)) where.status = status;

  const [debts, summary] = await Promise.all([
    prisma.debt.findMany({
      where,
      include: { payments: { orderBy: { createdAt: "desc" }, take: 10 } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
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

    await tx.debtPayment.create({
      data: { debtId: debt.id, amount, paymentMethod, paymentRef, note, recordedBy: req.user.userId },
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

module.exports = { list, create, recordPayment, update };
