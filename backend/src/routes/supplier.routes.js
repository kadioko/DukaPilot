const router = require("express").Router();
const ctrl = require("../controllers/supplier.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { supplierCreateValidation, supplierUpdateValidation, supplierOrdersValidation, supplierOrderStatusValidation } = require("../middleware/validation");

router.use(authenticate);

// Merchant-facing supplier directory (read-only is fine for any role)
router.get("/", ctrl.list);
router.get("/:id", ctrl.get);
router.post("/", requireRole("MERCHANT", "ADMIN"), requirePermission("canManageStock"), supplierCreateValidation, ctrl.create);
router.patch("/:id", requireRole("MERCHANT", "ADMIN"), requirePermission("canManageStock"), supplierUpdateValidation, ctrl.update);

// Supplier portal routes
router.get("/portal/orders", requireRole("SUPPLIER", "ADMIN"), supplierOrdersValidation, ctrl.myOrders);
router.get("/portal/dashboard", requireRole("SUPPLIER", "ADMIN"), ctrl.supplierDashboard);
router.patch("/portal/orders/:orderId/status", requireRole("SUPPLIER", "ADMIN"), supplierOrderStatusValidation, ctrl.updateOrderStatus);

module.exports = router;
