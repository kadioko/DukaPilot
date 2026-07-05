const router = require("express").Router();
const ctrl = require("../controllers/supplier.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const { supplierCreateValidation, supplierUpdateValidation, supplierOrdersValidation, supplierOrderStatusValidation } = require("../middleware/validation");

router.use(authenticate);

// Supplier portal routes must be declared before /:id so "portal" is not treated as a supplier id.
router.get("/portal/orders", requireRole("SUPPLIER", "ADMIN"), supplierOrdersValidation, ctrl.myOrders);
router.get("/portal/dashboard", requireRole("SUPPLIER", "ADMIN"), ctrl.supplierDashboard);
router.patch("/portal/orders/:orderId/status", requireRole("SUPPLIER", "ADMIN"), supplierOrderStatusValidation, ctrl.updateOrderStatus);

// Merchant-facing supplier directory (read-only is fine for any role)
router.get("/", ctrl.list);
router.get("/:id", ctrl.get);
router.post("/", requireRole("MERCHANT", "ADMIN"), requirePermission("canManageStock"), requireActiveSubscription, supplierCreateValidation, ctrl.create);
router.patch("/:id", requireRole("MERCHANT", "ADMIN"), requirePermission("canManageStock"), requireActiveSubscription, supplierUpdateValidation, ctrl.update);
router.delete("/:id", requireRole("ADMIN"), ctrl.remove);

module.exports = router;
