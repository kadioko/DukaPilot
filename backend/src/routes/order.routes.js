const router = require("express").Router();
const ctrl = require("../controllers/order.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const { orderListValidation, orderCreateValidation } = require("../middleware/validation");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canManageStock"));
router.use(requireActiveSubscription);

router.get("/", orderListValidation, ctrl.list);
router.get("/:id", ctrl.get);
router.post("/", orderCreateValidation, ctrl.create);
router.post("/:id/reorder", ctrl.reorder);
router.patch("/:id/confirm-delivery", ctrl.confirmDelivery);
router.patch("/:id/cancel", ctrl.cancel);

module.exports = router;
