const router = require("express").Router();
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const ctrl = require("../controllers/barcode.controller");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate, requireRole("MERCHANT", "ADMIN"), requireActiveSubscription);
router.get("/settings", ctrl.settings);
router.patch("/settings", requirePermission("canManageStock"), ctrl.settings);
router.get("/history", ctrl.history);
router.get("/report", requirePermission("canManageStock"), ctrl.report);
router.post("/generate", requirePermission("canManageStock"), ctrl.generate);
router.get("/lookup/:barcode", ctrl.lookup);
module.exports = router;
