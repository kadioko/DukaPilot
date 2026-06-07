const router = require("express").Router();
const ctrl = require("../controllers/product.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { productCreateValidation, productListValidation, productUpdateValidation } = require("../middleware/validation");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canManageStock"));

router.get("/", productListValidation, ctrl.list);
router.get("/low-stock", ctrl.getLowStock);
router.get("/:id", ctrl.get);
router.post("/", productCreateValidation, ctrl.create);
router.patch("/:id", productUpdateValidation, ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
