const router = require("express").Router();
const { overview, profitAnalytics } = require("../controllers/dashboard.controller");
const productPerformance = require("../controllers/productPerformance.controller");
const purchaseAnalytics = require("../controllers/purchaseAnalytics.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canViewReports"));

router.get("/", overview);
router.get("/profit", profitAnalytics);
router.get("/purchases", purchaseAnalytics.report);
router.get("/products/performance", productPerformance.list);
router.get("/products/:id/performance", productPerformance.detail);

module.exports = router;
