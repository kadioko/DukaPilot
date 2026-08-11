function cashSessionActorId(user) {
  return user.staffId ? `staff:${user.staffId}` : `user:${user.userId}`;
}

async function findOpenCashSession(tx, shopId, user) {
  if (!tx.cashSession?.findFirst) return null;
  return tx.cashSession.findFirst({
    where: { shopId, status: "OPEN", openedById: cashSessionActorId(user) },
    orderBy: { openedAt: "desc" },
  });
}

module.exports = { cashSessionActorId, findOpenCashSession };
