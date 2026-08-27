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

async function actorName(user) {
  if (user.staffId) {
    const staff = await prisma.staffMember.findFirst({ where: { id: user.staffId, isActive: true }, select: { name: true } });
    return staff?.name || "Staff";
  }
  const owner = await prisma.user.findUnique({ where: { id: user.userId }, select: { name: true } });
  return owner?.name || "Owner";
}

async function summarizeSession(tx, session) {
  const [sales, debtPayments, quotationPayments, quotationRefunds, expenses] = await Promise.all([
    tx.sale.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH", status: "COMPLETED" }, _sum: { totalAmount: true }, _count: { id: true } }),
    tx.debtPayment.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH" }, _sum: { amount: true }, _count: { id: true } }),
    tx.quotationPayment?.aggregate
      ? tx.quotationPayment.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH", debtPaymentId: null, kind: "PAYMENT" }, _sum: { amount: true }, _count: { id: true } })
      : Promise.resolve({ _sum: { amount: 0 }, _count: { id: 0 } }),
    tx.quotationPayment?.aggregate
      ? tx.quotationPayment.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH", debtPaymentId: null, kind: "REFUND" }, _sum: { amount: true }, _count: { id: true } })
      : Promise.resolve({ _sum: { amount: 0 }, _count: { id: 0 } }),
    tx.expense.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH" }, _sum: { amount: true }, _count: { id: true } }),
  ]);
  const cashSales = sales._sum.totalAmount || 0;
  const debtCollections = debtPayments._sum.amount || 0;
  const quotationCash = (quotationPayments._sum.amount || 0) - (quotationRefunds._sum.amount || 0);
  const quotationPaymentCount = (quotationPayments._count.id || 0) + (quotationRefunds._count.id || 0);
  const cashExpenses = expenses._sum.amount || 0;
  return {
    cashSales,
    debtCollections,
    quotationCash,
    cashExpenses,
    saleCount: sales._count.id,
    debtPaymentCount: debtPayments._count.id,
    quotationPaymentCount,
    expenseCount: expenses._count.id,
    expectedCash: session.openingCash + cashSales + debtCollections + quotationCash - cashExpenses,
  };
}

async function decorateSessions(tx, sessions) {
  if (!sessions.length) return [];
  const sessionIds = sessions.map((session) => session.id);

  // The daily-close history used to run five aggregates for every session.
  // Group the same facts once per table, then attach them to the sessions.
  const [sales, debtPayments, quotationPayments, expenses] = await Promise.all([
    tx.sale.groupBy({ by: ["cashSessionId"], where: { cashSessionId: { in: sessionIds }, paymentMethod: "CASH", status: "COMPLETED" }, _sum: { totalAmount: true }, _count: { id: true } }),
    tx.debtPayment.groupBy({ by: ["cashSessionId"], where: { cashSessionId: { in: sessionIds }, paymentMethod: "CASH" }, _sum: { amount: true }, _count: { id: true } }),
    tx.quotationPayment.groupBy({ by: ["cashSessionId", "kind"], where: { cashSessionId: { in: sessionIds }, paymentMethod: "CASH", debtPaymentId: null, kind: { in: ["PAYMENT", "REFUND"] } }, _sum: { amount: true }, _count: { id: true } }),
    tx.expense.groupBy({ by: ["cashSessionId"], where: { cashSessionId: { in: sessionIds }, paymentMethod: "CASH" }, _sum: { amount: true }, _count: { id: true } }),
  ]);
  const bySession = new Map(sessionIds.map((id) => [id, { cashSales: 0, debtCollections: 0, quotationCash: 0, cashExpenses: 0, saleCount: 0, debtPaymentCount: 0, quotationPaymentCount: 0, expenseCount: 0 }]));
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
  return sessions.map((session) => {
    const summary = bySession.get(session.id);
    return { ...session, summary: { ...summary, expectedCash: session.openingCash + summary.cashSales + summary.debtCollections + summary.quotationCash - summary.cashExpenses } };
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

module.exports = { current, open, close, summarizeSession };
