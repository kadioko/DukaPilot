const router = require("express").Router();
const ctrl = require("../controllers/sale.controller");
const saleReturn = require("../controllers/saleReturn.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const { saleListValidation, saleSummaryValidation, saleCreateValidation, saleVoidValidation } = require("../middleware/validation");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requireActiveSubscription);

router.patch("/:id/void", requirePermission("canViewReports"), saleVoidValidation, ctrl.voidSale);
router.post("/:id/returns", requirePermission("canViewReports"), saleReturn.create);

router.use(requirePermission("canSell"));

router.get("/", saleListValidation, ctrl.list);
router.get("/summary", saleSummaryValidation, ctrl.summary);
router.get("/:id", ctrl.get);
router.post("/", saleCreateValidation, ctrl.create);

module.exports = router;
