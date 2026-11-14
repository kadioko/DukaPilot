const crypto = require("node:crypto");

const MODES = new Set(["AUTO", "HANDOVER", "MANUAL"]);
const MOVEMENT_SIGNS = { OTHER_IN: 1, SHIFT_HANDOVER: 1, OWNER_WITHDRAWAL: -1, BANK_DEPOSIT: -1, MOBILE_DEPOSIT: -1 };
const MAX_TZS = 2147483647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function failure(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validateIdentity(shopId, actorId, requestKey) {
  if (typeof shopId !== "string" || !shopId || typeof actorId !== "string" || !actorId) throw failure("Shop and owner are required");
  if (typeof requestKey !== "string" || !UUID.test(requestKey)) throw failure("A valid retry key is required");
}

function validateAmount(amount, allowZero = false) {
  if (!Number.isSafeInteger(amount) || amount < (allowZero ? 0 : 1) || amount > MAX_TZS) throw failure("Amount must be a valid whole TZS amount");
}

async function lockShop(tx, shopId) {
  const shops = await tx.$queryRawUnsafe('SELECT "id" FROM "shops" WHERE "id" = $1 FOR UPDATE', shopId);
  if (!shops.length) throw failure("Shop not found", 404);
}

async function getBalance(tx, epoch) {
  const total = await tx.cashHoldingMovement.aggregate({ where: { shopId: epoch.shopId, epochId: epoch.id }, _sum: { amount: true } });
  const balance = epoch.openingAmount + Number(total._sum.amount || 0);
  if (!Number.isSafeInteger(balance)) throw failure("Cash balance is outside the supported range", 409);
  return balance;
}

async function lockActiveEpoch(tx, shopId) {
  let epoch = null;
  for (let attempt = 0; attempt < 3 && !epoch; attempt += 1) {
    if (typeof tx.$queryRawUnsafe === "function") {
      const rows = await tx.$queryRawUnsafe(
        'SELECT "id", "shopId", "mode", "openedAt" FROM "cash_holding_epochs" WHERE "shopId" = $1 AND "closedAt" IS NULL FOR UPDATE',
        shopId,
      );
      epoch = rows[0] || null;
    } else {
      epoch = await tx.cashHoldingEpoch.findFirst({ where: { shopId, closedAt: null } });
    }
  }
  return epoch;
}

async function recordAutomaticCashEvent(tx, { shopId, sourceType, sourceId, amount, occurredAt = new Date(), relatedSourceType = null, relatedSourceId = null }) {
  if (process.env.CASH_HOLDING_ENABLED !== "true") return { movement: null, replayed: false };
  if (!tx?.cashHoldingMovement || !tx?.cashHoldingEpoch) return { movement: null, replayed: false };
  if (typeof shopId !== "string" || !shopId || typeof sourceType !== "string" || !sourceType || typeof sourceId !== "string" || !sourceId) throw failure("Cash event source is required");
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > MAX_TZS) throw failure("Cash event amount must be a non-zero whole TZS amount");
  const occurred = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  if (Number.isNaN(occurred.getTime())) throw failure("Cash event date is invalid");

  const prior = await tx.cashHoldingMovement.findFirst({ where: { shopId, sourceType, sourceId } });
  if (prior) return { movement: prior, replayed: true };

  // A period switch may close the row while this SELECT waits. Repeat with a
  // fresh statement snapshot so an event is assigned to the new counted epoch.
  const epoch = await lockActiveEpoch(tx, shopId);
  if (!epoch || epoch.mode !== "AUTO" || occurred < epoch.openedAt) return { movement: null, replayed: false };
  // Database-created timestamps can be a few milliseconds ahead of the app
  // process clock. Allow minor skew, but reject a clearly future transaction
  // instead of committing its source record without a corresponding cash event.
  if (occurred.getTime() > Date.now() + 60_000) throw failure("Cash event date cannot be in the future");
  const lockedPrior = await tx.cashHoldingMovement.findFirst({ where: { shopId, sourceType, sourceId } });
  if (lockedPrior) return { movement: lockedPrior, replayed: true };

  const requestKey = `source:${sourceType}:${sourceId}`;
  const requestHash = hash({ shopId, sourceType, sourceId, amount, occurredAt: occurred.toISOString() });
  const movement = await tx.cashHoldingMovement.create({ data: {
    shopId,
    epochId: epoch.id,
    kind: "SOURCE_EVENT",
    amount,
    recordedBy: "system",
    requestKey,
    requestHash,
    sourceType,
    sourceId,
    relatedSourceType,
    relatedSourceId,
    createdAt: occurred,
  } });
  return { movement, replayed: false };
}

async function recordAutomaticCashCorrection(tx, { shopId, sourceId, relatedSourceType, relatedSourceId, amount, occurredAt = new Date() }) {
  if (process.env.CASH_HOLDING_ENABLED !== "true") return { movement: null, replayed: false };
  if (!tx?.cashHoldingMovement || !tx?.cashHoldingEpoch) return { movement: null, replayed: false };
  if (typeof relatedSourceType !== "string" || typeof relatedSourceId !== "string") throw failure("Corrected cash source is required");
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > MAX_TZS) return { movement: null, replayed: false };
  const epoch = await lockActiveEpoch(tx, shopId);
  if (!epoch || epoch.mode !== "AUTO") return { movement: null, replayed: false };
  const original = await tx.cashHoldingMovement.findFirst({ where: { shopId, epochId: epoch.id, sourceType: relatedSourceType, sourceId: relatedSourceId } });
  if (!original) return { movement: null, replayed: false };
  const requestKey = `source:correction:${sourceId}`;
  const existing = await tx.cashHoldingMovement.findFirst({ where: { shopId, requestKey } });
  if (existing) return { movement: existing, replayed: true };
  const requestHash = hash({ shopId, relatedSourceType, relatedSourceId, amount, epochId: epoch.id });
  const movement = await tx.cashHoldingMovement.create({ data: {
    shopId,
    epochId: epoch.id,
    kind: "SOURCE_EVENT",
    amount,
    recordedBy: "system",
    requestKey,
    requestHash,
    sourceType: "CASH_CORRECTION",
    sourceId,
    relatedSourceType,
    relatedSourceId,
    createdAt: occurredAt,
  } });
  return { movement, replayed: false };
}

async function adjustAutomaticCashSource(tx, { shopId, sourceType, sourceId, correctionId, newAmount, occurredAt = new Date() }) {
  if (process.env.CASH_HOLDING_ENABLED !== "true") return { movement: null, replayed: false };
  if (!tx?.cashHoldingMovement || !tx?.cashHoldingEpoch) return { movement: null, replayed: false };
  if (!Number.isSafeInteger(newAmount) || Math.abs(newAmount) > MAX_TZS) throw failure("Corrected cash effect must be a whole TZS amount");
  const epoch = await lockActiveEpoch(tx, shopId);
  if (!epoch || epoch.mode !== "AUTO") return { movement: null, replayed: false };
  const original = await tx.cashHoldingMovement.findFirst({ where: { shopId, epochId: epoch.id, sourceType, sourceId } });
  if (!original) {
    if (newAmount === 0) return { movement: null, replayed: false };
    return recordAutomaticCashEvent(tx, { shopId, sourceType, sourceId, amount: newAmount, occurredAt });
  }
  const adjustments = await tx.cashHoldingMovement.findMany({ where: { shopId, epochId: epoch.id, relatedSourceType: sourceType, relatedSourceId: sourceId } });
  const currentAmount = original.amount + adjustments.reduce((sum, item) => sum + item.amount, 0);
  // The original event is already in this counted epoch; changing the expense's
  // reporting date must not move that physical cash effect into another period.
  const effectiveNewAmount = newAmount;
  const delta = effectiveNewAmount - currentAmount;
  if (delta === 0) return { movement: null, replayed: false };
  return recordAutomaticCashCorrection(tx, { shopId, sourceId: correctionId, relatedSourceType: sourceType, relatedSourceId: sourceId, amount: delta, occurredAt: new Date() });
}

// Callers must authorize the owner and resolve the active branch before calling.
async function startEpoch(prisma, { shopId, actorId, requestKey, mode, countedCash, expectedEpochId = null }) {
  validateIdentity(shopId, actorId, requestKey);
  if (!MODES.has(mode)) throw failure("Invalid cash tracking mode");
  if (expectedEpochId !== null && (typeof expectedEpochId !== "string" || !expectedEpochId)) throw failure("Invalid previous cash period");
  validateAmount(countedCash, true);
  const requestHash = hash({ actorId, mode, countedCash, expectedEpochId });
  return prisma.$transaction(async (tx) => {
    await lockShop(tx, shopId);
    const existing = await tx.cashHoldingEpoch.findUnique({ where: { shopId_requestKey: { shopId, requestKey } } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw failure("Retry key already used for a different count", 409);
      return { epoch: existing, replayed: true };
    }
    const current = await tx.cashHoldingEpoch.findFirst({ where: { shopId, closedAt: null } });
    if ((current?.id || null) !== expectedEpochId) throw failure("Cash tracking changed. Refresh and count again before continuing", 409);
    const switchedAt = new Date();
    await tx.cashHoldingEpoch.updateMany({ where: { shopId, closedAt: null }, data: { closedAt: switchedAt } });
    const epoch = await tx.cashHoldingEpoch.create({ data: { shopId, mode, openingAmount: countedCash, openedAt: switchedAt, openedBy: actorId, requestKey, requestHash } });
    return { epoch, replayed: false };
  });
}

async function recordMovement(prisma, { shopId, actorId, requestKey, expectedEpochId, kind, amount, note, cashSessionId, reversesMovementId, replacesMovementId }) {
  validateIdentity(shopId, actorId, requestKey);
  if (typeof expectedEpochId !== "string" || !expectedEpochId) throw failure("A current cash period is required");
  const cleanNote = typeof note === "string" ? note.trim() : "";
  if (cleanNote.length > 500) throw failure("Note is too long");
  if (kind === "REVERSAL") {
    if (typeof reversesMovementId !== "string" || !reversesMovementId || !cleanNote) throw failure("A movement and reason are required for a reversal");
    if (amount !== undefined || cashSessionId != null || replacesMovementId != null) throw failure("Reversal amount and session are determined by the original movement");
  } else {
    if (!Object.hasOwn(MOVEMENT_SIGNS, kind)) throw failure("Invalid cash movement type");
    validateAmount(amount);
    if (reversesMovementId != null || (replacesMovementId != null && kind !== "SHIFT_HANDOVER")) throw failure("Unexpected correction reference");
    if (replacesMovementId != null && (typeof replacesMovementId !== "string" || !replacesMovementId)) throw failure("Invalid handover correction reference");
    if (kind === "SHIFT_HANDOVER" ? typeof cashSessionId !== "string" || !cashSessionId : cashSessionId != null) throw failure("Invalid shift reference");
  }
  const requestHash = hash({ actorId, expectedEpochId, kind, amount: amount ?? null, note: cleanNote || null, cashSessionId: cashSessionId ?? null, reversesMovementId: reversesMovementId ?? null, replacesMovementId: replacesMovementId ?? null });
  return prisma.$transaction(async (tx) => {
    await lockShop(tx, shopId);
    const existing = await tx.cashHoldingMovement.findUnique({ where: { shopId_requestKey: { shopId, requestKey } } });
    if (existing) {
      if (existing.requestHash !== requestHash) throw failure("Retry key already used for a different movement", 409);
      return { movement: existing, replayed: true };
    }
    const epoch = await tx.cashHoldingEpoch.findFirst({ where: { shopId, closedAt: null } });
    if (!epoch) throw failure("Set up cash tracking with a physical count first", 409);
    if (epoch.id !== expectedEpochId) throw failure("Cash tracking changed. Refresh before recording a movement", 409);
    let signedAmount;
    if (kind === "REVERSAL") {
      const original = await tx.cashHoldingMovement.findFirst({ where: { id: reversesMovementId, shopId }, include: { reversal: true } });
      if (!original) throw failure("Cash movement not found", 404);
      if (original.epochId !== epoch.id || original.kind === "REVERSAL" || original.kind === "SOURCE_EVENT" || original.reversal) throw failure("This movement cannot be reversed in the current period", 409);
      signedAmount = -original.amount;
    } else {
      signedAmount = MOVEMENT_SIGNS[kind] * amount;
      if (kind === "SHIFT_HANDOVER") {
        if (epoch.mode !== "HANDOVER") throw failure("Shift handovers require handover mode", 409);
        const session = await tx.cashSession.findFirst({ where: { id: cashSessionId, shopId, status: "CLOSED", closedAt: { gte: epoch.openedAt } }, select: { countedCash: true, cashTransferredOut: true, cashTransferDestination: true } });
        if (!session) throw failure("Closed shift not found", 404);
        const safeTransfer = session.cashTransferDestination === "SAFE" ? session.cashTransferredOut || 0 : 0;
        const eligibleCash = (session.countedCash || 0) + safeTransfer;
        if (session.countedCash === null || amount > eligibleCash) throw failure("Handover cannot exceed cash counted plus cash transferred to the business safe", 409);
        const prior = (await tx.cashHoldingMovement.findMany({ where: { shopId, cashSessionId, kind: "SHIFT_HANDOVER" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { reversal: true } }))[0] || null;
        if (prior && !prior.reversal) throw failure("This shift handover has already been recorded", 409);
        if (prior && prior.id !== replacesMovementId) throw failure("Select the last reversed handover before recording its replacement", 409);
        if (!prior && replacesMovementId) throw failure("The handover to replace was not found", 404);
        if (replacesMovementId) {
          const replaced = await tx.cashHoldingMovement.findFirst({ where: { id: replacesMovementId, shopId, cashSessionId, kind: "SHIFT_HANDOVER" }, include: { reversal: true } });
          if (!replaced?.reversal) throw failure("Only a reversed handover can be replaced", 409);
          if (await tx.cashHoldingMovement.findFirst({ where: { replacesMovementId } })) throw failure("This handover already has a replacement", 409);
        }
      }
    }
    const balance = await getBalance(tx, epoch);
    if (balance + signedAmount < 0) throw failure("Movement exceeds the recorded cash balance", 409);
    const movement = await tx.cashHoldingMovement.create({ data: {
      shopId, epochId: epoch.id, kind, amount: signedAmount, note: cleanNote || null,
      recordedBy: actorId, requestKey, requestHash,
      ...(kind === "SHIFT_HANDOVER" ? { cashSessionId } : {}),
      ...(kind === "REVERSAL" ? { reversesMovementId } : {}),
      ...(kind === "SHIFT_HANDOVER" && replacesMovementId ? { replacesMovementId } : {}),
    } });
    return { movement, replayed: false };
  });
}

module.exports = { startEpoch, recordMovement, getBalance, recordAutomaticCashEvent, recordAutomaticCashCorrection, adjustAutomaticCashSource };
