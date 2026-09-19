const prisma = require("../lib/prisma");
const { getBillingShopIdForUser } = require("../lib/shopAccess");
const wallet = require("../services/merchantWallet.service");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function ownerOnly(req, res, next) {
  if (req.user.role !== "MERCHANT" || req.user.staffId) {
    return res.status(403).json({ error: "Only the business owner can access the merchant balance." });
  }
  return next();
}

function pageValue(value, fallback, maximum) {
  return Math.min(Math.max(Number(value) || fallback, 1), maximum);
}

async function merchantShopId(req) {
  return getBillingShopIdForUser(req.user);
}

const overview = asyncHandler(async (req, res) => {
  const shopId = await merchantShopId(req);
  const data = await wallet.merchantWalletOverview(shopId, {
    page: pageValue(req.query.page, 1, 100000),
    limit: pageValue(req.query.limit, 20, 50),
    status: req.query.status,
    kind: req.query.kind,
  });
  res.json(data);
});

const deposit = asyncHandler(async (req, res) => {
  const shopId = await merchantShopId(req);
  const result = await wallet.createDeposit({
    shopId,
    userId: req.user.userId,
    amountTzs: req.body.amountTzs,
    phone: req.body.phone,
    requestKey: req.body.requestKey,
  });
  req.audit = {
    action: "merchant_wallet.deposit.request",
    resourceType: "merchant_wallet_transaction",
    resourceId: result.transaction.id,
    metadata: { shopId, amountTzs: result.transaction.amountTzs, status: result.transaction.status, reused: result.reused },
  };
  res.status(result.reused ? 200 : 201).json({ transaction: wallet.publicTransaction(result.transaction), reused: result.reused });
});

const withdrawalQuote = asyncHandler(async (req, res) => {
  const shopId = await merchantShopId(req);
  const quote = await wallet.getWithdrawalQuote({ shopId, amountTzs: req.body.amountTzs, phone: req.body.phone });
  res.json({ quote });
});

const withdrawal = asyncHandler(async (req, res) => {
  const shopId = await merchantShopId(req);
  const result = await wallet.createWithdrawal({
    shopId,
    userId: req.user.userId,
    amountTzs: req.body.amountTzs,
    phone: req.body.phone,
    requestKey: req.body.requestKey,
    confirmedQuote: req.body.confirmedQuote,
  });
  req.audit = {
    action: "merchant_wallet.withdrawal.request",
    resourceType: "merchant_wallet_transaction",
    resourceId: result.transaction.id,
    metadata: {
      shopId,
      amountTzs: result.transaction.amountTzs,
      platformFeeTzs: result.transaction.platformFeeTzs,
      providerFeeTzs: result.transaction.providerFeeTzs,
      totalDebitTzs: result.transaction.totalDebitTzs,
      status: result.transaction.status,
      reused: result.reused,
    },
  };
  res.status(result.reused ? 200 : 201).json({ transaction: wallet.publicTransaction(result.transaction), reused: result.reused });
});

const reconcileOwn = asyncHandler(async (req, res) => {
  const shopId = await merchantShopId(req);
  const transaction = await prisma.merchantWalletTransaction.findFirst({ where: { id: req.params.id, shopId } });
  if (!transaction) return res.status(404).json({ error: "Wallet transaction not found." });
  const current = await wallet.resumeMerchantTransaction(transaction.id);
  req.audit = { action: "merchant_wallet.transaction.check", resourceType: "merchant_wallet_transaction", resourceId: transaction.id, metadata: { shopId, status: current?.status || transaction.status } };
  res.json({ transaction: wallet.publicTransaction(current || transaction) });
});

const adminSummary = asyncHandler(async (_req, res) => {
  res.json(await wallet.adminOverview());
});

const adminTransactions = asyncHandler(async (req, res) => {
  res.json(await wallet.listAdminTransactions({
    page: pageValue(req.query.page, 1, 100000),
    limit: pageValue(req.query.limit, 25, 100),
    status: req.query.status,
    kind: req.query.kind,
    search: req.query.search,
  }));
});

const adminReconcile = asyncHandler(async (req, res) => {
  const transaction = await prisma.merchantWalletTransaction.findUnique({ where: { id: req.params.id } });
  if (!transaction) return res.status(404).json({ error: "Wallet transaction not found." });
  const current = await wallet.resumeMerchantTransaction(transaction.id);
  req.audit = { action: "admin.merchant_wallet.reconcile", resourceType: "merchant_wallet_transaction", resourceId: transaction.id, metadata: { status: current?.status || transaction.status } };
  res.json({ transaction: wallet.publicTransaction(current || transaction) });
});

const adminReconcilePending = asyncHandler(async (req, res) => {
  const result = await wallet.reconcilePending(req.body.limit);
  req.audit = { action: "admin.merchant_wallet.reconcilePending", resourceType: "merchant_wallet", metadata: { checked: result.checked } };
  res.json(result);
});

const adminAdjustment = asyncHandler(async (req, res) => {
  const shopId = String(req.body.shopId || "").trim();
  const shop = await prisma.shop.findFirst({ where: { id: shopId, parentShopId: null }, select: { id: true, name: true } });
  if (!shop) return res.status(404).json({ error: "Main business not found." });
  const transaction = await wallet.createAdminAdjustment({
    shopId: shop.id,
    userId: req.user.userId,
    direction: req.body.direction,
    amountTzs: req.body.amountTzs,
    reason: req.body.reason,
    requestKey: req.body.requestKey,
  });
  req.audit = {
    action: "admin.merchant_wallet.adjust",
    resourceType: "merchant_wallet_transaction",
    resourceId: transaction.id,
    metadata: { shopId: shop.id, direction: req.body.direction, amountTzs: transaction.amountTzs, reason: String(req.body.reason || "").slice(0, 160) },
  };
  res.status(201).json({ transaction: wallet.publicTransaction(transaction), shop });
});

module.exports = {
  ownerOnly,
  overview,
  deposit,
  withdrawalQuote,
  withdrawal,
  reconcileOwn,
  adminSummary,
  adminTransactions,
  adminReconcile,
  adminReconcilePending,
  adminAdjustment,
};
