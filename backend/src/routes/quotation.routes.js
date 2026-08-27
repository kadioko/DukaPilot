const router = require("express").Router();
const ctrl = require("../controllers/quotation.controller");
const { authenticate, requireRole, requirePermission, requireAnyPermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requireActiveSubscription);

router.get("/settings", requirePermission("canViewQuotations"), ctrl.getSettings);
router.patch("/settings", requirePermission("canManageStaff"), ctrl.updateSettings);
router.get("/customers", requirePermission("canViewQuotations"), ctrl.customers);
router.get("/services", requirePermission("canViewQuotations"), ctrl.services);
router.post("/services", requirePermission("canCreateQuotations"), ctrl.createService);
router.get("/metrics", requirePermission("canViewQuotations"), ctrl.metrics);
router.get("/", requirePermission("canViewQuotations"), ctrl.list);
router.post("/", requirePermission("canCreateQuotations"), ctrl.create);
router.get("/:id", requirePermission("canViewQuotations"), ctrl.get);
router.patch("/:id", requireAnyPermission("canCreateQuotations", "canEditSentQuotations"), ctrl.update);
router.post("/:id/duplicate", requirePermission("canCreateQuotations"), ctrl.duplicate);
router.get("/:id/revisions", requirePermission("canViewQuotations"), ctrl.revisions);
router.post("/:id/revisions/:revisionNumber/restore", requirePermission("canEditSentQuotations"), ctrl.restoreRevision);
router.post("/:id/send", requirePermission("canSendQuotations"), ctrl.send);
router.post("/:id/shares", requirePermission("canSendQuotations"), ctrl.markShared);
router.post("/:id/accept", requirePermission("canAcceptQuotations"), ctrl.accept);
router.post("/:id/reject", requirePermission("canAcceptQuotations"), ctrl.reject);
router.post("/:id/archive", requirePermission("canArchiveQuotations"), ctrl.archive);
router.post("/:id/cancel", requirePermission("canArchiveQuotations"), ctrl.cancel);
router.delete("/:id", requirePermission("canDeleteQuotationDrafts"), ctrl.removeDraft);
router.post("/:id/payments", requirePermission("canRecordQuotationPayments"), ctrl.recordPayment);
router.post("/:id/refunds", requirePermission("canRecordQuotationPayments"), ctrl.refundPayment);
router.post("/:id/convert", requirePermission("canConvertQuotations"), ctrl.convert);

module.exports = router;
