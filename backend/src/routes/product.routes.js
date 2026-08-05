const router = require("express").Router();
const ctrl = require("../controllers/product.controller");
const { authenticate, requireRole, requirePermission, requireAnyPermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const { productCreateValidation, productListValidation, productUpdateValidation } = require("../middleware/validation");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requireActiveSubscription);

// Cashiers need a read-only product catalogue to build and scan POS sales.
router.get("/", requireAnyPermission("canManageStock", "canSell"), productListValidation, ctrl.list);
router.get("/low-stock", requirePermission("canManageStock"), ctrl.getLowStock);
router.get("/:id", requireAnyPermission("canManageStock", "canSell"), ctrl.get);
router.post("/", requirePermission("canManageStock"), productCreateValidation, ctrl.create);
router.use(requirePermission("canManageStock"));
router.patch("/:id", productUpdateValidation, ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
