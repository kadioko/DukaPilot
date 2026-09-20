const router = require("express").Router();
const { authenticate, requireRole } = require("../middleware/auth");
const controller = require("../controllers/merchantWallet.controller");
const {
  merchantWalletDepositLimiter,
  merchantWalletQuoteLimiter,
  merchantWalletWithdrawalLimiter,
  merchantWalletReconcileLimiter,
  subscriptionPaymentLimiter,
} = require("../middleware/rateLimit");

// Platform operations intentionally live before owner routes. Staff accounts
// never receive an implicit balance permission, even if they can manage cash.
router.get("/admin/overview", authenticate, requireRole("ADMIN"), controller.adminSummary);
router.get("/admin/transactions", authenticate, requireRole("ADMIN"), controller.adminTransactions);
router.post("/admin/reconcile-pending", authenticate, requireRole("ADMIN"), merchantWalletReconcileLimiter, controller.adminReconcilePending);
router.post("/admin/transactions/:id/reconcile", authenticate, requireRole("ADMIN"), merchantWalletReconcileLimiter, controller.adminReconcile);
router.post("/admin/adjustments", authenticate, requireRole("ADMIN"), merchantWalletReconcileLimiter, controller.adminAdjustment);

router.use(authenticate);
router.use(requireRole("MERCHANT"));
router.use(controller.ownerOnly);
router.get("/", controller.overview);
router.post("/deposits", merchantWalletDepositLimiter, controller.deposit);
router.post("/withdrawals/quote", merchantWalletQuoteLimiter, controller.withdrawalQuote);
router.post("/withdrawals", merchantWalletWithdrawalLimiter, controller.withdrawal);
router.post("/subscription-payments", subscriptionPaymentLimiter, controller.subscriptionPayment);
router.post("/transactions/:id/check", merchantWalletReconcileLimiter, controller.reconcileOwn);

module.exports = router;
