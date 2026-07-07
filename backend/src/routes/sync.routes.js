const router = require("express").Router();
const ctrl = require("../controllers/sync.controller");
const { authenticate, requireRole } = require("../middleware/auth");

router.use(authenticate);

router.post("/events", ctrl.createEvent);
router.get("/events", ctrl.myEvents);
router.get("/admin/events", requireRole("ADMIN"), ctrl.adminEvents);
router.patch("/admin/events/:eventId", requireRole("ADMIN"), ctrl.adminUpdateEvent);
router.patch("/admin/device-label", requireRole("ADMIN"), ctrl.adminUpdateDeviceLabel);
router.get("/admin/summary", requireRole("ADMIN"), ctrl.adminSummary);

module.exports = router;
