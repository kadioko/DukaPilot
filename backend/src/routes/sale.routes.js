const router = require("express").Router();
const ctrl = require("../controllers/sale.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { saleListValidation, saleSummaryValidation, saleCreateValidation } = require("../middleware/validation");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canSell"));

router.get("/", saleListValidation, ctrl.list);
router.get("/summary", saleSummaryValidation, ctrl.summary);
router.get("/:id", ctrl.get);
router.post("/", saleCreateValidation, ctrl.create);

module.exports = router;
