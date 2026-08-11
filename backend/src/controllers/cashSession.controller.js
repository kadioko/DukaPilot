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
  const [sales, debtPayments, expenses] = await Promise.all([
    tx.sale.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH", status: "COMPLETED" }, _sum: { totalAmount: true }, _count: { id: true } }),
    tx.debtPayment.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH" }, _sum: { amount: true }, _count: { id: true } }),
    tx.expense.aggregate({ where: { cashSessionId: session.id, paymentMethod: "CASH" }, _sum: { amount: true }, _count: { id: true } }),
  ]);
  const cashSales = sales._sum.totalAmount || 0;
  const debtCollections = debtPayments._sum.amount || 0;
  const cashExpenses = expenses._sum.amount || 0;
  return {
    cashSales,
    debtCollections,
    cashExpenses,
    saleCount: sales._count.id,
    debtPaymentCount: debtPayments._count.id,
    expenseCount: expenses._count.id,
    expectedCash: session.openingCash + cashSales + debtCollections - cashExpenses,
  };
}

async function decorateSessions(tx, sessions) {
  return Promise.all(sessions.map(async (session) => ({ ...session, summary: await summarizeSession(tx, session) })));
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
  res.json({
    session: session ? { ...session, summary: await summarizeSession(prisma, session) } : null,
    sessions: await decorateSessions(prisma, sessions),
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
