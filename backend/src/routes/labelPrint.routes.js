const router = require("express").Router();
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const ctrl = require("../controllers/labelPrint.controller");

router.use(authenticate, requireRole("MERCHANT", "ADMIN"), requireActiveSubscription, requirePermission("canManageStock"));
router.get("/", ctrl.list);
router.post("/templates", ctrl.createTemplate);
router.patch("/templates/:id", ctrl.updateTemplate);
router.delete("/templates/:id", ctrl.removeTemplate);
router.post("/printer-profiles", ctrl.createProfile);
router.patch("/printer-profiles/:id", ctrl.updateProfile);
router.delete("/printer-profiles/:id", ctrl.removeProfile);
router.post("/print-jobs", ctrl.prepareJob);
router.get("/print-jobs/:id/output", ctrl.getOutput);
router.post("/print-jobs/:id/complete", ctrl.completeJob);

module.exports = router;
