const router = require("express").Router();
const ctrl = require("../controllers/order.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const { orderListValidation, orderMatchValidation, orderCreateValidation, orderInvoiceValidation, orderTrackingStatusValidation } = require("../middleware/validation");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canManageStock"));
router.use(requirePermission("canViewReports"));
router.use(requireActiveSubscription);

router.get("/", orderListValidation, ctrl.list);
router.get("/match", orderMatchValidation, ctrl.matchByInvoice);
router.get("/:id", ctrl.get);
router.post("/", orderCreateValidation, ctrl.create);
router.patch("/:id", orderCreateValidation, ctrl.update);
router.patch("/:id/invoice-number", orderInvoiceValidation, ctrl.updateInvoiceNumber);
router.patch("/:id/tracking-status", orderTrackingStatusValidation, ctrl.updateTrackingStatus);
router.delete("/:id", ctrl.remove);
router.post("/:id/reorder", ctrl.reorder);
router.patch("/:id/confirm-delivery", ctrl.confirmDelivery);
router.patch("/:id/cancel", ctrl.cancel);

module.exports = router;
