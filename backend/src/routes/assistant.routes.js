const router = require("express").Router();
const ctrl = require("../controllers/assistant.controller");
const { authenticate, requireRole } = require("../middleware/auth");

router.use(authenticate);

router.get("/admin/analytics", requireRole("ADMIN"), ctrl.adminAnalytics);
router.use(requireRole("MERCHANT"));
router.get("/actions", ctrl.listActions);
router.post("/actions", ctrl.trackAction);

module.exports = router;
