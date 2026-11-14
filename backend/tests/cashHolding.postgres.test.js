const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
process.env.CASH_HOLDING_ENABLED = "true";

const database = new URL(process.env.DATABASE_URL || "postgresql://invalid");
if (!["localhost", "127.0.0.1"].includes(database.hostname) || !database.pathname.startsWith("/dukapilot_test")) {
  throw new Error("Cash holding tests require a local dukapilot_test database");
}
const prisma = require("../src/lib/prisma");
const { startEpoch, recordMovement, getBalance, recordAutomaticCashEvent, adjustAutomaticCashSource } = require("../src/services/cashHolding.service");
const controller = require("../src/controllers/cashHolding.controller");
test.after(async () => prisma.$disconnect());

test("simultaneous cash movements serialize and keyed retries do not duplicate", { timeout: 20000 }, async (t) => {
  const id = randomUUID();
  const user = await prisma.user.create({ data: { phone: `cash-test-${id}`, pin: "test-only", name: "Test owner" } });
  const shop = await prisma.shop.create({ data: { userId: user.id, name: "Test cash shop", location: "Test", referralCode: id } });
  t.after(async () => {
    await prisma.cashHoldingMovement.deleteMany({ where: { shopId: shop.id } });
    await prisma.cashHoldingEpoch.deleteMany({ where: { shopId: shop.id } });
    await prisma.shop.deleteMany({ where: { id: shop.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });
  const identity = { shopId: shop.id, actorId: user.id };
  const manualEpoch = (await startEpoch(prisma, { ...identity, requestKey: randomUUID(), mode: "MANUAL", countedCash: 10000 })).epoch;
  identity.expectedEpochId = manualEpoch.id;
  const withdrawal = () => recordMovement(prisma, { ...identity, requestKey: randomUUID(), kind: "OWNER_WITHDRAWAL", amount: 7000 });
  const outcomes = await Promise.allSettled([withdrawal(), withdrawal()]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.find((outcome) => outcome.status === "rejected").reason.status, 409);
  assert.equal(await getBalance(prisma, manualEpoch), 3000);
  const deposit = { ...identity, requestKey: randomUUID(), kind: "OTHER_IN", amount: 2000 };
  const results = await Promise.all([recordMovement(prisma, deposit), recordMovement(prisma, deposit)]);
  assert.equal(results[0].movement.id, results[1].movement.id);
  assert.equal(results.filter((result) => result.replayed).length, 1);
  assert.equal(await getBalance(prisma, manualEpoch), 5000);
  const epoch = (await startEpoch(prisma, { ...identity, requestKey: randomUUID(), mode: "AUTO", countedCash: 5000, expectedEpochId: manualEpoch.id })).epoch;
  identity.expectedEpochId = epoch.id;
  await recordMovement(prisma, { ...identity, requestKey: randomUUID(), kind: "OWNER_WITHDRAWAL", amount: 300 });
  const sourceEvents = await prisma.$transaction(async (tx) => {
    const sale = await recordAutomaticCashEvent(tx, { shopId: shop.id, sourceType: "SALE", sourceId: `sale-${id}`, amount: 2000 });
    const expense = await recordAutomaticCashEvent(tx, { shopId: shop.id, sourceType: "EXPENSE", sourceId: `expense-${id}`, amount: -1000 });
    const correction = await adjustAutomaticCashSource(tx, { shopId: shop.id, sourceType: "EXPENSE", sourceId: `expense-${id}`, correctionId: `correction-${id}`, newAmount: -1200 });
    return { sale, expense, correction };
  });
  assert.equal(sourceEvents.sale.movement.sourceType, "SALE");
  assert.equal(sourceEvents.expense.movement.amount, -1000);
  assert.equal(sourceEvents.correction.movement.amount, -200);
  const concurrentKey = `sale-concurrent-${id}`;
  const concurrentEvents = await Promise.all([1, 2].map(() => prisma.$transaction((tx) => recordAutomaticCashEvent(tx, { shopId: shop.id, sourceType: "SALE", sourceId: concurrentKey, amount: 1000 }))));
  assert.equal(concurrentEvents.filter((result) => result.replayed).length, 1);
  assert.equal(await getBalance(prisma, epoch), 6500);
  const next = (await startEpoch(prisma, { ...identity, requestKey: randomUUID(), mode: "HANDOVER", countedCash: 4500, expectedEpochId: epoch.id })).epoch;
  const closed = await prisma.cashHoldingEpoch.findUnique({ where: { id: epoch.id } });
  assert.equal(closed.closedAt.toISOString(), next.openedAt.toISOString());
  assert.equal(await getBalance(prisma, next), 4500);
  await assert.rejects(() => recordMovement(prisma, { ...identity, requestKey: randomUUID(), kind: "OTHER_IN", amount: 1 }), { status: 409 });
});

test("handover and owner reads remain scoped to the active branch", { timeout: 20000 }, async (t) => {
  const id = randomUUID();
  const user = await prisma.user.create({ data: { phone: `cash-branch-${id}`, pin: "test-only", name: "Test owner" } });
  const root = await prisma.shop.create({ data: { userId: user.id, name: "Root", location: "Test", referralCode: `root-${id}` } });
  const branch = await prisma.shop.create({ data: { parentShopId: root.id, name: "Branch", location: "Test", referralCode: `branch-${id}` } });
  t.after(async () => {
    await prisma.cashHoldingMovement.deleteMany({ where: { shopId: { in: [root.id, branch.id] } } });
    await prisma.cashHoldingEpoch.deleteMany({ where: { shopId: { in: [root.id, branch.id] } } });
    await prisma.cashSession.deleteMany({ where: { shopId: { in: [root.id, branch.id] } } });
    await prisma.shop.deleteMany({ where: { id: branch.id } });
    await prisma.shop.deleteMany({ where: { id: root.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });
  const identity = { shopId: root.id, actorId: user.id };
  identity.expectedEpochId = (await startEpoch(prisma, { ...identity, requestKey: randomUUID(), mode: "HANDOVER", countedCash: 1000 })).epoch.id;
  const branchEpoch = (await startEpoch(prisma, { shopId: branch.id, actorId: user.id, requestKey: randomUUID(), mode: "HANDOVER", countedCash: 9000 })).epoch;
  const shift = await prisma.cashSession.create({ data: { shopId: root.id, status: "CLOSED", openedById: "staff:synthetic", openedByName: "Synthetic cashier", countedCash: 4000, closedAt: new Date(Date.now() + 1000) } });
  await assert.rejects(() => recordMovement(prisma, { shopId: branch.id, actorId: user.id, expectedEpochId: branchEpoch.id, requestKey: randomUUID(), kind: "SHIFT_HANDOVER", amount: 1000, cashSessionId: shift.id }), { status: 404 });
  const handover = { ...identity, requestKey: randomUUID(), kind: "SHIFT_HANDOVER", amount: 2500, cashSessionId: shift.id };
  const results = await Promise.allSettled([recordMovement(prisma, handover), recordMovement(prisma, { ...handover, requestKey: randomUUID() })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.status, 409);
  const firstHandover = results.find((result) => result.status === "fulfilled").value.movement;
  await recordMovement(prisma, { ...identity, expectedEpochId: identity.expectedEpochId, requestKey: randomUUID(), kind: "REVERSAL", reversesMovementId: firstHandover.id, note: "Correct test handover" });
  const replacement = await recordMovement(prisma, { ...handover, requestKey: randomUUID(), amount: 2000, replacesMovementId: firstHandover.id });
  assert.equal(replacement.movement.replacesMovementId, firstHandover.id);
  const activeRootEpoch = await prisma.cashHoldingEpoch.findFirst({ where: { shopId: root.id, closedAt: null } });
  assert.equal(await getBalance(prisma, activeRootEpoch), 3000);
  const response = { payload: null, json(value) { this.payload = value; return this; } };
  await controller.current({ user: { userId: user.id, resolvedShopId: branch.id }, query: {} }, response, (error) => { throw error; });
  assert.equal(response.payload.balance, 9000);
  assert.deepEqual(response.payload.movements, []);
});
