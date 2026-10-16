const router = require("express").Router();
const controller = require("../controllers/supplierPayable.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate, requireRole("MERCHANT", "ADMIN"), requirePermission("canManageStock"), requirePermission("canViewReports"), requireActiveSubscription);
router.get("/", controller.list);
router.get("/:supplierId/receipts", controller.receipts);
router.post("/receipts/:receiptId/payment-corrections", controller.correctReceiptPayment);
router.post("/payments", controller.recordPayment);
router.post("/payments/:paymentId/reverse", controller.reversePayment);
router.post("/credits", controller.recordCredit);
router.post("/credits/:creditId/reverse", controller.reverseCredit);

module.exports = router;
