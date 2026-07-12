const router = require("express").Router();
const { overview, profitAnalytics } = require("../controllers/dashboard.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canViewReports"));

router.get("/", overview);
router.get("/profit", profitAnalytics);

module.exports = router;
