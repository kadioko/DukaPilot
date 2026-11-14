const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { startEpoch, recordMovement, getBalance } = require("../services/cashHolding.service");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function pagination(query) {
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.page, 10) || 1));
  const limit = Math.max(1, Math.min(50, Number.parseInt(query.limit, 10) || 20));
  return { page, limit };
}

const current = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { page, limit } = pagination(req.query);
  const snapshot = await prisma.$transaction(async (tx) => {
    const epoch = await tx.cashHoldingEpoch.findFirst({ where: { shopId, closedAt: null }, select: { id: true, shopId: true, mode: true, openingAmount: true, openedAt: true } });
    if (!epoch) return { epoch: null, balance: null, movements: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } };
    const where = { shopId };
    const [balance, movements, total] = await Promise.all([
      getBalance(tx, epoch),
      tx.cashHoldingMovement.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit, select: { id: true, epochId: true, kind: true, amount: true, note: true, createdAt: true, sourceType: true, sourceId: true, relatedSourceType: true, relatedSourceId: true, cashSessionId: true, reversesMovementId: true, reversal: { select: { id: true } }, epoch: { select: { mode: true, openedAt: true } } } }),
      tx.cashHoldingMovement.count({ where }),
    ]);
    return { epoch, balance, movements, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }, { isolationLevel: "RepeatableRead" });
  res.json(snapshot);
});

const handovers = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { page, limit } = pagination(req.query);
  const epoch = await prisma.cashHoldingEpoch.findFirst({ where: { shopId, closedAt: null } });
  if (!epoch || epoch.mode !== "HANDOVER") return res.json({ sessions: [], pagination: { page: 1, limit, total: 0, totalPages: 0 } });
  const where = { shopId, status: "CLOSED", closedAt: { gte: epoch.openedAt }, cashHoldingHandovers: { none: { kind: "SHIFT_HANDOVER", reversal: { is: null } } } };
  const [sessions, total] = await Promise.all([
    prisma.cashSession.findMany({ where, select: { id: true, openedByName: true, openedAt: true, closedAt: true, countedCash: true, cashTransferredOut: true, cashTransferDestination: true, cashHoldingHandovers: { where: { kind: "SHIFT_HANDOVER" }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, reversal: { select: { id: true } } } } }, orderBy: [{ closedAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
    prisma.cashSession.count({ where }),
  ]);
  res.json({ sessions: sessions.map(({ cashHoldingHandovers, ...session }) => ({ ...session, previousHandoverId: cashHoldingHandovers[0]?.reversal ? cashHoldingHandovers[0].id : null })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

const count = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const body = req.body || {};
  const result = await startEpoch(prisma, { shopId, actorId: req.user.userId, requestKey: body.requestKey, mode: body.mode, countedCash: body.countedCash, expectedEpochId: body.expectedEpochId });
  if (!result.replayed) req.audit = { action: "cash_holding.count", resourceType: "cash_holding_epoch", resourceId: result.epoch.id, metadata: { mode: result.epoch.mode, openingAmount: result.epoch.openingAmount } };
  const { requestHash: _requestHash, ...epoch } = result.epoch;
  res.status(result.replayed ? 200 : 201).json({ epoch, replayed: result.replayed });
});

const movement = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const body = req.body || {};
  const result = await recordMovement(prisma, { shopId, actorId: req.user.userId, requestKey: body.requestKey, expectedEpochId: body.expectedEpochId, kind: body.kind, amount: body.amount, note: body.note, cashSessionId: body.cashSessionId, reversesMovementId: body.reversesMovementId, replacesMovementId: body.replacesMovementId });
  if (!result.replayed) req.audit = { action: "cash_holding.movement", resourceType: "cash_holding_movement", resourceId: result.movement.id, metadata: { kind: result.movement.kind, amount: result.movement.amount } };
  const { requestHash: _requestHash, ...savedMovement } = result.movement;
  res.status(result.replayed ? 200 : 201).json({ movement: savedMovement, replayed: result.replayed });
});

module.exports = { current, handovers, count, movement };
