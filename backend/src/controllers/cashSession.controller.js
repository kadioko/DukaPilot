const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { startOfTanzaniaDay } = require("../lib/businessTime");
const { cashSessionActorId, findOpenCashSession } = require("../lib/cashSession");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function canManageAllSessions(req) {
  return req.user.role === "ADMIN" || !req.user.staffId;
}

function paginationValue(value, fallback, maximum) {
  return Math.min(Math.max(Number(value) || fallback, 1), maximum);
}

function dateBoundary(value, endExclusive = false) {
  if (!value) return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) return undefined;
  return endExclusive ? new Date(date.getTime() + 24 * 60 * 60 * 1000) : date;
}

// Quote payments already represent collected money. This avoids counting a
// legacy converted quote sale in the same cash session a second time.
function cashSaleWhere(cashSessionId) {
  return {
    cashSessionId,
    paymentMethod: "CASH",
    status: "COMPLETED",
    NOT: {
      quotation: {
        is: {
          payments: { some: { kind: "PAYMENT", paymentMethod: "CASH", debtPaymentId: null } },
        },
      },
    },
  };
}

async function actorName(user) {
  if (user.staffId) {
    const staff = await prisma.staffMember.findFirst({ where: { id: user.staffId, isActive: true }, select: { name: true } });
    return staff?.name || "Staff";
  }
  const owner = await prisma.user.findUnique({ where: { id: user.userId }, select: { name: true } });
  return owner?.name || "Owner";
}

async function summarizeSession(tx, session) {
  const [sales, debtPayments, quotationPayments, quotationRefunds, expenses, stockReceipts, foodPreparation] = await Promise.all([
    tx.sale.aggregate({ where: cashSaleWhere(session.id), _sum: { totalAmount: true }, _count: { id: true } }),
    tx.debtPayment.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH" }, _sum: { amount: true }, _count: { id: true } }),
    tx.quotationPayment?.aggregate
      ? tx.quotationPayment.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH", debtPaymentId: null, kind: "PAYMENT" }, _sum: { amount: true }, _count: { id: true } })
      : Promise.resolve({ _sum: { amount: 0 }, _count: { id: 0 } }),
    tx.quotationPayment?.aggregate
      ? tx.quotationPayment.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH", debtPaymentId: null, kind: "REFUND" }, _sum: { amount: true }, _count: { id: true } })
      : Promise.resolve({ _sum: { amount: 0 }, _count: { id: 0 } }),
    tx.expense.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH" }, _sum: { amount: true }, _count: { id: true } }),
    tx.stockReceipt?.aggregate
      ? tx.stockReceipt.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH" }, _sum: { totalLandedCost: true }, _count: { id: true } })
      : Promise.resolve({ _sum: { totalLandedCost: 0 }, _count: { id: 0 } }),
    tx.foodPreparationBatch?.aggregate
      ? tx.foodPreparationBatch.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH" }, _sum: { additionalCost: true }, _count: { id: true } })
      : Promise.resolve({ _sum: { additionalCost: 0 }, _count: { id: 0 } }),
  ]);
  const cashSales = sales._sum.totalAmount || 0;
  const debtCollections = debtPayments._sum.amount || 0;
  const quotationCash = (quotationPayments._sum.amount || 0) - (quotationRefunds._sum.amount || 0);
  const quotationPaymentCount = (quotationPayments._count.id || 0) + (quotationRefunds._count.id || 0);
  const cashExpenses = expenses._sum.amount || 0;
  const inventoryCashOut = stockReceipts._sum.totalLandedCost || 0;
  const cookingCashOut = foodPreparation._sum.additionalCost || 0;
  return {
    cashSales,
    debtCollections,
    quotationCash,
    cashExpenses,
    inventoryCashOut,
    cookingCashOut,
    saleCount: sales._count.id,
    debtPaymentCount: debtPayments._count.id,
    quotationPaymentCount,
    expenseCount: expenses._count.id,
    stockReceiptCount: stockReceipts._count.id,
    cookingCostCount: foodPreparation._count.id,
    expectedCash: session.openingCash + cashSales + debtCollections + quotationCash - cashExpenses - inventoryCashOut - cookingCashOut,
  };
}

async function decorateSessions(tx, sessions) {
  if (!sessions.length) return [];
  const sessionIds = sessions.map((session) => session.id);

  // The daily-close history used to run five aggregates for every session.
  // Group the same facts once per table, then attach them to the sessions.
  const [sales, debtPayments, quotationPayments, expenses, stockReceipts, foodPreparation] = await Promise.all([
    tx.sale.groupBy({ by: ["cashSessionId"], where: cashSaleWhere({ in: sessionIds }), _sum: { totalAmount: true }, _count: { id: true } }),
    tx.debtPayment.groupBy({ by: ["cashSessionId"], where: { cashSessionId: { in: sessionIds }, paymentMethod: "CASH" }, _sum: { amount: true }, _count: { id: true } }),
    tx.quotationPayment.groupBy({ by: ["cashSessionId", "kind"], where: { cashSessionId: { in: sessionIds }, paymentMethod: "CASH", debtPaymentId: null, kind: { in: ["PAYMENT", "REFUND"] } }, _sum: { amount: true }, _count: { id: true } }),
    tx.expense.groupBy({ by: ["cashSessionId"], where: { cashSessionId: { in: sessionIds }, paymentMethod: "CASH" }, _sum: { amount: true }, _count: { id: true } }),
    tx.stockReceipt?.groupBy
      ? tx.stockReceipt.groupBy({ by: ["cashSessionId"], where: { cashSessionId: { in: sessionIds }, paymentMethod: "CASH" }, _sum: { totalLandedCost: true }, _count: { id: true } })
      : Promise.resolve([]),
    tx.foodPreparationBatch?.groupBy
      ? tx.foodPreparationBatch.groupBy({ by: ["cashSessionId"], where: { cashSessionId: { in: sessionIds }, paymentMethod: "CASH" }, _sum: { additionalCost: true }, _count: { id: true } })
      : Promise.resolve([]),
  ]);
  const bySession = new Map(sessionIds.map((id) => [id, { cashSales: 0, debtCollections: 0, quotationCash: 0, cashExpenses: 0, inventoryCashOut: 0, cookingCashOut: 0, saleCount: 0, debtPaymentCount: 0, quotationPaymentCount: 0, expenseCount: 0, stockReceiptCount: 0, cookingCostCount: 0 }]));
  for (const row of sales) {
    const summary = bySession.get(row.cashSessionId);
    if (summary) { summary.cashSales = row._sum.totalAmount || 0; summary.saleCount = row._count.id; }
  }
  for (const row of debtPayments) {
    const summary = bySession.get(row.cashSessionId);
    if (summary) { summary.debtCollections = row._sum.amount || 0; summary.debtPaymentCount = row._count.id; }
  }
  for (const row of quotationPayments) {
    const summary = bySession.get(row.cashSessionId);
    if (summary) {
      summary.quotationCash += (row.kind === "REFUND" ? -1 : 1) * (row._sum.amount || 0);
      summary.quotationPaymentCount += row._count.id;
    }
  }
  for (const row of expenses) {
    const summary = bySession.get(row.cashSessionId);
    if (summary) { summary.cashExpenses = row._sum.amount || 0; summary.expenseCount = row._count.id; }
  }
  for (const row of stockReceipts) {
    const summary = bySession.get(row.cashSessionId);
    if (summary) { summary.inventoryCashOut = row._sum.totalLandedCost || 0; summary.stockReceiptCount = row._count.id; }
  }
  for (const row of foodPreparation) {
    const summary = bySession.get(row.cashSessionId);
    if (summary) { summary.cookingCashOut = row._sum.additionalCost || 0; summary.cookingCostCount = row._count.id; }
  }
  return sessions.map((session) => {
    const summary = bySession.get(session.id);
    return { ...session, summary: { ...summary, expectedCash: session.openingCash + summary.cashSales + summary.debtCollections + summary.quotationCash - summary.cashExpenses - summary.inventoryCashOut - summary.cookingCashOut } };
  });
}

const current = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const actorId = cashSessionActorId(req.user);
  const session = await findOpenCashSession(prisma, shopId, req.user);
  const todayStart = startOfTanzaniaDay();
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const where = canManageAllSessions(req)
    ? { shopId, OR: [{ openedAt: { gte: todayStart, lt: todayEnd } }, { closedAt: { gte: todayStart, lt: todayEnd } }, { status: "OPEN" }] }
    : { shopId, openedById: actorId, OR: [{ openedAt: { gte: todayStart, lt: todayEnd } }, { closedAt: { gte: todayStart, lt: todayEnd } }, { status: "OPEN" }] };
  const sessions = await prisma.cashSession.findMany({ where, orderBy: { openedAt: "desc" }, take: 30 });
  const decoratedSessions = await decorateSessions(prisma, sessions);
  res.json({
    session: session ? decoratedSessions.find((item) => item.id === session.id) || { ...session, summary: await summarizeSession(prisma, session) } : null,
    sessions: decoratedSessions,
    canManageAllSessions: canManageAllSessions(req),
  });
});

const history = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const page = paginationValue(req.query.page, 1, 100000);
  const limit = paginationValue(req.query.limit, 10, 50);
  const status = String(req.query.status || "CLOSED").toUpperCase();
  const from = dateBoundary(req.query.from);
  const to = dateBoundary(req.query.to, true);
  const search = String(req.query.search || "").trim();
  if (!new Set(["ALL", "OPEN", "CLOSED"]).has(status)) return res.status(400).json({ error: "Status must be ALL, OPEN, or CLOSED" });
  if (from === undefined || to === undefined) return res.status(400).json({ error: "Dates must use YYYY-MM-DD" });
  if (from && to && from >= to) return res.status(400).json({ error: "The start date must be before the end date" });

  const where = { shopId };
  if (!canManageAllSessions(req)) where.openedById = cashSessionActorId(req.user);
  if (status !== "ALL") where.status = status;
  if (search) where.openedByName = { contains: search, mode: "insensitive" };
  const dateField = status === "CLOSED" ? "closedAt" : "openedAt";
  if (from || to) where[dateField] = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };

  const [sessions, total] = await Promise.all([
    prisma.cashSession.findMany({ where, orderBy: [{ openedAt: "desc" }], skip: (page - 1) * limit, take: limit }),
    prisma.cashSession.count({ where }),
  ]);
  res.json({
    sessions: await decorateSessions(prisma, sessions),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    canManageAllSessions: canManageAllSessions(req),
  });
});

const open = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const openingCash = Number(req.body.openingCash || 0);
  const note = String(req.body.note || "").trim() || null;
  if (!Number.isInteger(openingCash) || openingCash < 0) {
    return res.status(400).json({ error: "Opening cash must be a whole TZS amount of 0 or more" });
  }
  const existing = await findOpenCashSession(prisma, shopId, req.user);
  if (existing) return res.status(409).json({ error: "You already have an open cash session. Close it before opening another." });

  const session = await prisma.cashSession.create({
    data: { shopId, openingCash, note, openedById: cashSessionActorId(req.user), openedByName: await actorName(req.user) },
  });
  req.audit = { action: "cash_session.open", resourceType: "cash_session", resourceId: session.id, metadata: { openingCash } };
  res.status(201).json({ session: { ...session, summary: await summarizeSession(prisma, session) } });
});

const close = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const countedCash = Number(req.body.countedCash);
  const note = String(req.body.note || "").trim() || null;
  if (!Number.isInteger(countedCash) || countedCash < 0) {
    return res.status(400).json({ error: "Cash counted must be a whole TZS amount of 0 or more" });
  }

  const session = await prisma.cashSession.findFirst({ where: { id: req.params.id, shopId } });
  if (!session) return res.status(404).json({ error: "Cash session not found" });
  if (session.status !== "OPEN") return res.status(409).json({ error: "This cash session is already closed" });
  if (!canManageAllSessions(req) && session.openedById !== cashSessionActorId(req.user)) {
    return res.status(403).json({ error: "You can close only your own cash session" });
  }

  const summary = await summarizeSession(prisma, session);
  const updated = await prisma.cashSession.update({
    where: { id: session.id },
    data: { status: "CLOSED", expectedCash: summary.expectedCash, countedCash, variance: countedCash - summary.expectedCash, note: note || session.note, closedAt: new Date() },
  });
  req.audit = { action: "cash_session.close", resourceType: "cash_session", resourceId: updated.id, metadata: { expectedCash: summary.expectedCash, countedCash, variance: updated.variance } };
  res.json({ session: { ...updated, summary } });
});

module.exports = { current, history, open, close, summarizeSession, cashSaleWhere };
