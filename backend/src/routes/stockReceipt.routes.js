const router = require("express").Router();
const controller = require("../controllers/stockReceipt.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canManageStock"));
router.use(requireActiveSubscription);
router.get("/", controller.list);
router.post("/", controller.receive);

module.exports = router;
