const router = require("express").Router();
const ctrl = require("../controllers/assistant.controller");
const { authenticate, requireRole, requirePermission, requireAnyPermission } = require("../middleware/auth");
const { requireFeature, requireAssistantAccess } = require("../lib/entitlements");

router.use(authenticate);

router.get("/admin/analytics", requireRole("ADMIN"), ctrl.adminAnalytics);
router.use(requireRole("MERCHANT"));
router.use(requireFeature("ASSISTANT"));
router.use(requireAssistantAccess);
router.get("/stock", requirePermission("canManageStock"), ctrl.stockSummary);
router.get("/quotations", requireAnyPermission("canViewQuotationCosts", "canViewReports"), ctrl.quotationSummary);
router.get("/actions", requirePermission("canViewReports"), ctrl.listActions);
router.post("/actions", requirePermission("canViewReports"), ctrl.trackAction);

module.exports = router;
