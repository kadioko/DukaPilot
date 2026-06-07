const router = require("express").Router();
const ctrl = require("../controllers/stock.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { stockAdjustValidation, stockMovementsValidation } = require("../middleware/validation");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canManageStock"));

router.post("/adjust", stockAdjustValidation, ctrl.adjust);
router.get("/:productId/movements", stockMovementsValidation, ctrl.movements);

module.exports = router;
