const router = require("express").Router();
const controller = require("../controllers/cashSession.controller");
const { authenticate, requireRole, requirePermission, requireAnyPermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requireAnyPermission("canSell", "canManageCashSessions"));
router.use(requireActiveSubscription);
router.get("/current", controller.current);
router.get("/history", controller.history);
router.post("/open", requirePermission("canSell"), controller.open);
router.post("/:id/close", controller.close);

module.exports = router;
