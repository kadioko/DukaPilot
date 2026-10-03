function cashSessionActorId(user) {
  return user.staffId ? `staff:${user.staffId}` : `user:${user.userId}`;
}

async function findOpenCashSession(tx, shopId, user) {
  if (!tx.cashSession?.findFirst) return null;
  const openedById = cashSessionActorId(user);
  if (typeof tx.$queryRawUnsafe === "function") {
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "cash_sessions" WHERE "shopId" = $1 AND "status" = \'OPEN\' AND "openedById" = $2 ORDER BY "openedAt" DESC LIMIT 1 FOR UPDATE',
      shopId,
      openedById,
    );
  }
  return tx.cashSession.findFirst({
    where: { shopId, status: "OPEN", openedById },
    orderBy: { openedAt: "desc" },
  });
}

module.exports = { cashSessionActorId, findOpenCashSession };
