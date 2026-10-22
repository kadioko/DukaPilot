const router = require("express").Router();
const controller = require("../controllers/stockReceipt.controller");
const correction = require("../controllers/stockReceiptCorrection.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canManageStock"));
router.use(requirePermission("canViewReports"));
router.use(requireActiveSubscription);
router.get("/", controller.list);
router.get("/:id", controller.get);
router.post("/", controller.receive);
router.post("/:id/corrections", requirePermission("canCorrectStock"), correction.correct);

module.exports = router;
