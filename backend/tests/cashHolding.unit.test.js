const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
process.env.CASH_HOLDING_ENABLED = "true";
const { startEpoch, recordMovement, getBalance } = require("../src/services/cashHolding.service");

function fakeDatabase() {
  const epochs = [];
  const movements = [];
  const sessions = [{ id: "shift-1", shopId: "shop-1", status: "CLOSED", closedAt: new Date(Date.now() + 10000), countedCash: 5000, cashTransferredOut: 2000, cashTransferDestination: "SAFE" }];
  const tx = {
    $queryRawUnsafe: async (_sql, shopId) => shopId.startsWith("shop-") ? [{ id: shopId }] : [],
    cashHoldingEpoch: {
      findUnique: async ({ where }) => epochs.find((item) => item.shopId === where.shopId_requestKey.shopId && item.requestKey === where.shopId_requestKey.requestKey) || null,
      findFirst: async ({ where }) => epochs.find((item) => item.shopId === where.shopId && item.closedAt === null) || null,
      updateMany: async ({ where, data }) => epochs.filter((item) => item.shopId === where.shopId && item.closedAt === null).forEach((item) => Object.assign(item, data)),
      create: async ({ data }) => { const item = { id: `epoch-${epochs.length + 1}`, closedAt: null, ...data }; epochs.push(item); return item; },
    },
    cashHoldingMovement: {
      findUnique: async ({ where }) => where.cashSessionId ? movements.find((item) => item.cashSessionId === where.cashSessionId) || null : movements.find((item) => item.shopId === where.shopId_requestKey.shopId && item.requestKey === where.shopId_requestKey.requestKey) || null,
      findFirst: async ({ where }) => { const item = movements.find((entry) => Object.entries(where).every(([key, value]) => entry[key] === value)); return item ? { ...item, reversal: movements.find((entry) => entry.reversesMovementId === item.id) || null } : null; },
      findMany: async ({ where, include }) => movements.filter((entry) => Object.entries(where).every(([key, value]) => entry[key] === value)).map((item) => include?.reversal ? { ...item, reversal: movements.find((entry) => entry.reversesMovementId === item.id) || null } : item),
      aggregate: async ({ where }) => ({ _sum: { amount: movements.filter((item) => item.shopId === where.shopId && item.epochId === where.epochId).reduce((sum, item) => sum + item.amount, 0) } }),
      create: async ({ data }) => { const item = { id: `movement-${movements.length + 1}`, createdAt: new Date(Date.now() + movements.length), ...data }; movements.push(item); return item; },
    },
    cashSession: { findFirst: async ({ where }) => sessions.find((item) => item.id === where.id && item.shopId === where.shopId && item.status === where.status && item.closedAt >= where.closedAt.gte) || null },
  };
  return { ...tx, $transaction: async (callback) => callback(tx), epochs, movements };
}

test("counted periods and manual movements are scoped, idempotent and reversible", async () => {
  const db = fakeDatabase();
  const identity = { shopId: "shop-1", actorId: "owner-1" };
  const count = { ...identity, requestKey: randomUUID(), mode: "MANUAL", countedCash: 20000 };
  const first = await startEpoch(db, count);
  identity.expectedEpochId = first.epoch.id;
  assert.equal((await startEpoch(db, count)).replayed, true);
  await assert.rejects(() => startEpoch(db, { ...count, countedCash: 10000 }), { status: 409 });
  const deposit = { ...identity, requestKey: randomUUID(), kind: "BANK_DEPOSIT", amount: 5000, note: "Bank" };
  const saved = await recordMovement(db, deposit);
  assert.equal(saved.movement.amount, -5000);
  assert.equal((await recordMovement(db, deposit)).replayed, true);
  await assert.rejects(() => recordMovement(db, { ...deposit, amount: 6000 }), { status: 409 });
  assert.equal(await getBalance(db, first.epoch), 15000);
  await assert.rejects(() => recordMovement(db, { ...identity, requestKey: randomUUID(), kind: "OWNER_WITHDRAWAL", amount: 15001 }), { status: 409 });
  await assert.rejects(() => recordMovement(db, { ...identity, requestKey: randomUUID(), kind: "REVERSAL", reversesMovementId: saved.movement.id }), { status: 400 });
  await recordMovement(db, { ...identity, requestKey: randomUUID(), kind: "REVERSAL", reversesMovementId: saved.movement.id, note: "Entry mistake" });
  assert.equal(await getBalance(db, first.epoch), 20000);
  await assert.rejects(() => recordMovement(db, { ...identity, requestKey: randomUUID(), kind: "REVERSAL", reversesMovementId: saved.movement.id, note: "Duplicate" }), { status: 409 });
  await assert.rejects(() => recordMovement(db, { ...identity, shopId: "shop-2", requestKey: randomUUID(), kind: "REVERSAL", reversesMovementId: saved.movement.id, note: "Other shop" }), { status: 409 });
  await assert.rejects(() => startEpoch(db, { ...identity, expectedEpochId: null, requestKey: randomUUID(), mode: "HANDOVER", countedCash: 9000 }), { status: 409 });
  const next = await startEpoch(db, { ...identity, requestKey: randomUUID(), mode: "HANDOVER", countedCash: 9000, expectedEpochId: first.epoch.id });
  assert.equal(first.epoch.closedAt instanceof Date, true);
  assert.equal(await getBalance(db, next.epoch), 9000);
  await assert.rejects(() => recordMovement(db, { ...identity, requestKey: randomUUID(), kind: "OTHER_IN", amount: 1 }), { status: 409 });
  identity.expectedEpochId = next.epoch.id;
  await assert.rejects(() => recordMovement(db, { ...identity, requestKey: randomUUID(), kind: "REVERSAL", reversesMovementId: saved.movement.id, note: "Old period" }), { status: 409 });
});

test("handover requires an unrecorded closed shift in the same shop and a bounded amount", async () => {
  const db = fakeDatabase();
  const identity = { shopId: "shop-1", actorId: "owner-1" };
  const epoch = (await startEpoch(db, { ...identity, requestKey: randomUUID(), mode: "HANDOVER", countedCash: 0 })).epoch;
  identity.expectedEpochId = epoch.id;
  await assert.rejects(() => recordMovement(db, { ...identity, requestKey: randomUUID(), kind: "SHIFT_HANDOVER", amount: 7001, cashSessionId: "shift-1" }), { status: 409 });
  const handover = { ...identity, requestKey: randomUUID(), kind: "SHIFT_HANDOVER", amount: 3000, cashSessionId: "shift-1" };
  await recordMovement(db, handover);
  assert.equal((await recordMovement(db, handover)).replayed, true);
  await assert.rejects(() => recordMovement(db, { ...handover, requestKey: randomUUID() }), { status: 409 });
  assert.equal(await getBalance(db, epoch), 3000);
  const otherEpoch = (await startEpoch(db, { shopId: "shop-2", actorId: "owner-2", requestKey: randomUUID(), mode: "HANDOVER", countedCash: 0 })).epoch;
  await assert.rejects(() => recordMovement(db, { ...handover, shopId: "shop-2", actorId: "owner-2", expectedEpochId: otherEpoch.id, requestKey: randomUUID() }), { status: 404 });
});

test("cash moved from a drawer to the business safe remains eligible for owner handover", async () => {
  const db = fakeDatabase();
  const identity = { shopId: "shop-1", actorId: "owner-1" };
  const epoch = (await startEpoch(db, { ...identity, requestKey: randomUUID(), mode: "HANDOVER", countedCash: 0 })).epoch;
  const result = await recordMovement(db, { ...identity, expectedEpochId: epoch.id, requestKey: randomUUID(), kind: "SHIFT_HANDOVER", amount: 6500, cashSessionId: "shift-1" });
  assert.equal(result.movement.amount, 6500);
});

test("a reversed shift handover can be re-entered once as a linked replacement", async () => {
  const db = fakeDatabase();
  const identity = { shopId: "shop-1", actorId: "owner-1" };
  const epoch = (await startEpoch(db, { ...identity, requestKey: randomUUID(), mode: "HANDOVER", countedCash: 0 })).epoch;
  const handover = { ...identity, expectedEpochId: epoch.id, requestKey: randomUUID(), kind: "SHIFT_HANDOVER", amount: 4000, cashSessionId: "shift-1" };
  const original = (await recordMovement(db, handover)).movement;
  await recordMovement(db, { ...identity, expectedEpochId: epoch.id, requestKey: randomUUID(), kind: "REVERSAL", reversesMovementId: original.id, note: "Wrong amount" });
  await assert.rejects(() => recordMovement(db, { ...handover, requestKey: randomUUID() }), { status: 409 });
  const replacement = await recordMovement(db, { ...handover, requestKey: randomUUID(), amount: 2500, replacesMovementId: original.id });
  assert.equal(replacement.movement.amount, 2500);
  assert.equal(replacement.movement.replacesMovementId, original.id);
  assert.equal(await getBalance(db, epoch), 2500);
  await assert.rejects(() => recordMovement(db, { ...handover, requestKey: randomUUID(), replacesMovementId: original.id }), { status: 409 });
});

test("automatic mode starts from a fresh count, permits owner cash movements, and protects source events", async () => {
  const db = fakeDatabase();
  const identity = { shopId: "shop-1", actorId: "owner-1" };
  const epoch = (await startEpoch(db, { ...identity, requestKey: randomUUID(), mode: "AUTO", countedCash: 10000 })).epoch;
  const movement = await recordMovement(db, { ...identity, expectedEpochId: epoch.id, requestKey: randomUUID(), kind: "OTHER_IN", amount: 500 });
  assert.equal(movement.movement.amount, 500);
  await assert.rejects(() => recordMovement(db, { ...identity, expectedEpochId: epoch.id, requestKey: randomUUID(), kind: "SHIFT_HANDOVER", amount: 500, cashSessionId: "shift-1" }), { status: 409 });
  const { recordAutomaticCashEvent } = require("../src/services/cashHolding.service");
  const tx = { cashHoldingEpoch: db.cashHoldingEpoch, cashHoldingMovement: db.cashHoldingMovement, $queryRawUnsafe: async () => [epoch] };
  const source = (await recordAutomaticCashEvent(tx, { shopId: identity.shopId, sourceType: "SALE", sourceId: "sale-auto", amount: 2500, occurredAt: new Date() })).movement;
  await assert.rejects(() => recordMovement(db, { ...identity, expectedEpochId: epoch.id, requestKey: randomUUID(), kind: "REVERSAL", reversesMovementId: source.id, note: "Use the sale correction flow" }), { status: 409 });
  assert.equal(await getBalance(db, epoch), 13000);
});

test("automatic cash source entries are linked once and exclude pre-count records", async () => {
  const { recordAutomaticCashEvent } = require("../src/services/cashHolding.service");
  const db = fakeDatabase();
  const openedAt = new Date(Date.now() - 120_000);
  const occurredAt = new Date(Date.now() - 60_000);
  const epoch = { id: "auto-epoch", shopId: "shop-1", mode: "AUTO", openedAt, closedAt: null, openingAmount: 10000 };
  db.epochs.push(epoch);
  const tx = {
    cashHoldingEpoch: db.cashHoldingEpoch,
    cashHoldingMovement: db.cashHoldingMovement,
    $queryRawUnsafe: async () => [epoch],
  };
  const input = { shopId: "shop-1", sourceType: "SALE", sourceId: "sale-1", amount: 2500, occurredAt };
  const first = await recordAutomaticCashEvent(tx, input);
  assert.equal(first.movement.amount, 2500);
  assert.equal(first.movement.epochId, epoch.id);
  assert.equal((await recordAutomaticCashEvent(tx, input)).replayed, true);
  const historical = await recordAutomaticCashEvent(tx, { ...input, sourceId: "sale-before-count", occurredAt: new Date(openedAt.getTime() - 60_000) });
  assert.equal(historical.movement, null);
  await assert.rejects(() => recordAutomaticCashEvent(tx, { ...input, sourceId: "sale-in-future", occurredAt: new Date(Date.now() + 120_000) }), { status: 400 });
  const clockSkew = await recordAutomaticCashEvent(tx, { ...input, sourceId: "database-clock-skew", occurredAt: new Date(Date.now() + 10) });
  assert.ok(clockSkew.movement);
  assert.equal(db.movements.length, 2);
});

test("automatic corrections append only the changed cash amount and retain the source link", async () => {
  const { recordAutomaticCashEvent, adjustAutomaticCashSource } = require("../src/services/cashHolding.service");
  const db = fakeDatabase();
  const epoch = { id: "auto-epoch", shopId: "shop-1", mode: "AUTO", openedAt: new Date(Date.now() - 120_000), closedAt: null, openingAmount: 10000 };
  db.epochs.push(epoch);
  const tx = { cashHoldingEpoch: db.cashHoldingEpoch, cashHoldingMovement: db.cashHoldingMovement, $queryRawUnsafe: async () => [epoch] };
  const occurredAt = new Date(Date.now() - 60_000);
  await recordAutomaticCashEvent(tx, { shopId: "shop-1", sourceType: "EXPENSE", sourceId: "expense-1", amount: -1000, occurredAt });
  await adjustAutomaticCashSource(tx, { shopId: "shop-1", sourceType: "EXPENSE", sourceId: "expense-1", correctionId: "correction-1", newAmount: -1200, occurredAt });
  assert.equal(db.movements[1].amount, -200);
  assert.equal(db.movements[1].relatedSourceType, "EXPENSE");
  assert.equal(db.movements[1].relatedSourceId, "expense-1");
  const noChange = await adjustAutomaticCashSource(tx, { shopId: "shop-1", sourceType: "EXPENSE", sourceId: "expense-1", correctionId: "correction-2", newAmount: -1200, occurredAt });
  assert.equal(noChange.movement, null);
  await adjustAutomaticCashSource(tx, { shopId: "shop-1", sourceType: "EXPENSE", sourceId: "expense-1", correctionId: "correction-3", newAmount: 0, occurredAt });
  assert.equal(db.movements[2].amount, 1200);
  assert.equal(db.movements.length, 3);
});

test("an expense corrected to cash creates an event when none was previously recorded", async () => {
  const { adjustAutomaticCashSource } = require("../src/services/cashHolding.service");
  const db = fakeDatabase();
  const epoch = { id: "auto-epoch", shopId: "shop-1", mode: "AUTO", openedAt: new Date(Date.now() - 120_000), closedAt: null, openingAmount: 10000 };
  db.epochs.push(epoch);
  const tx = { cashHoldingEpoch: db.cashHoldingEpoch, cashHoldingMovement: db.cashHoldingMovement, $queryRawUnsafe: async () => [epoch] };
  const corrected = await adjustAutomaticCashSource(tx, { shopId: "shop-1", sourceType: "EXPENSE", sourceId: "expense-now-cash", correctionId: "expense-correction", newAmount: -750, occurredAt: new Date(Date.now() - 1000) });
  assert.equal(corrected.movement.amount, -750);
  assert.equal(corrected.movement.sourceType, "EXPENSE");
  assert.equal(corrected.movement.sourceId, "expense-now-cash");
});

test("cash transaction hooks do not query the new tables while the feature is disabled", async () => {
  const { recordAutomaticCashEvent, adjustAutomaticCashSource } = require("../src/services/cashHolding.service");
  const previous = process.env.CASH_HOLDING_ENABLED;
  delete process.env.CASH_HOLDING_ENABLED;
  const forbidden = new Proxy({}, { get() { throw new Error("Cash holding storage must not be queried while disabled"); } });
  try {
    assert.deepEqual(await recordAutomaticCashEvent(forbidden, { shopId: "shop-1", sourceType: "SALE", sourceId: "sale-1", amount: 100 }), { movement: null, replayed: false });
    assert.deepEqual(await adjustAutomaticCashSource(forbidden, { shopId: "shop-1", sourceType: "EXPENSE", sourceId: "expense-1", correctionId: "correction-1", newAmount: -100 }), { movement: null, replayed: false });
  } finally {
    if (previous === undefined) delete process.env.CASH_HOLDING_ENABLED;
    else process.env.CASH_HOLDING_ENABLED = previous;
  }
});

test("cash event sources remain connected to their transactional controller paths", () => {
  const hooks = [
    ["sale.controller.js", 'recordAutomaticCashEvent(tx, { shopId, sourceType: "SALE", sourceId: newSale.id, amount: newSale.totalAmount, occurredAt: newSale.createdAt })'],
    ["sale.controller.js", 'adjustAutomaticCashSource(tx, { shopId, sourceType: "SALE", sourceId: existing.id'],
    ["customerOrder.controller.js", 'recordAutomaticCashEvent(tx, { shopId: shop.id, sourceType: "SALE", sourceId: sale.id'],
    ["debt.controller.js", 'recordAutomaticCashEvent(tx, { shopId, sourceType: "DEBT_PAYMENT", sourceId: payment.id'],
    ["quotation.controller.js", 'sourceType: "QUOTATION_PAYMENT"'],
    ["quotation.controller.js", 'sourceType: "QUOTATION_REFUND"'],
    ["saleReturn.controller.js", 'sourceType: "SALE_RETURN"'],
    ["saleReturn.controller.js", 'sourceType: "SALE_RETURN_REVERSAL"'],
    ["stockReceipt.controller.js", 'sourceType: "STOCK_RECEIPT"'],
    ["supplierPayable.controller.js", 'sourceType: "STOCK_RECEIPT_PAYMENT_CORRECTION"'],
    ["supplierPayable.controller.js", 'sourceType: "SUPPLIER_PAYMENT", sourceId: created.id, amount: -created.amount'],
    ["supplierPayable.controller.js", 'sourceType: "SUPPLIER_PAYMENT", sourceId: saved.id, amount: -saved.amount'],
    ["expense.controller.js", 'sourceType: "EXPENSE", sourceId: expense.id, amount: -expense.amount'],
    ["expense.controller.js", 'adjustAutomaticCashSource(tx, { shopId, sourceType: "EXPENSE", sourceId: current.id'],
    ["farm.controller.js", 'sourceType: "FARM_PRODUCTION_COST"'],
    ["crop.controller.js", 'sourceType: "CROP_DIRECT_COST"'],
    ["foodPreparation.controller.js", 'sourceType: "FOOD_PREPARATION_COST"'],
    ["cashSession.controller.js", 'sourceType: "SHIFT_CASH_TRANSFER"'],
  ];

  for (const [file, source] of hooks) {
    const controller = fs.readFileSync(path.resolve(__dirname, "../src/controllers", file), "utf8");
    assert.ok(controller.includes(source), `${file} is missing its cash event hook: ${source}`);
  }
});
