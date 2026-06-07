const router = require("express").Router();
const { overview } = require("../controllers/dashboard.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canViewReports"));

router.get("/", overview);

module.exports = router;
