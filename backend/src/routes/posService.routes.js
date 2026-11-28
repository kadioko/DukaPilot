const router = require("express").Router();
const ctrl = require("../controllers/posService.controller");
const { authenticate, requireRole, requirePermission, requireAnyPermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate, requireRole("MERCHANT", "ADMIN"), requireActiveSubscription);
router.get("/", requireAnyPermission("canManageStock", "canSell", "canViewSalePrices"), ctrl.list);
router.post("/", requirePermission("canManageStock"), ctrl.create);
router.patch("/:id", requirePermission("canManageStock"), ctrl.update);
module.exports = router;
