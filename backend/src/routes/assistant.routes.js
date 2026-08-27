const router = require("express").Router();
const ctrl = require("../controllers/assistant.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { requireFeature } = require("../lib/entitlements");

router.use(authenticate);

router.get("/admin/analytics", requireRole("ADMIN"), ctrl.adminAnalytics);
router.use(requireRole("MERCHANT"));
router.use(requireFeature("ASSISTANT"));
router.get("/quotations", requirePermission("canViewQuotations"), ctrl.quotationSummary);
router.get("/actions", ctrl.listActions);
router.post("/actions", ctrl.trackAction);

module.exports = router;
