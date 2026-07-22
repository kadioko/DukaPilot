const router = require("express").Router();
const { authenticate, requireRole } = require("../middleware/auth");
const controller = require("../controllers/push.controller");

router.use(authenticate);
router.use(requireRole("MERCHANT"));
router.get("/config", controller.config);
router.get("/preferences", controller.getPreferences);
router.patch("/preferences", controller.updatePreferences);
router.post("/subscribe", controller.subscribe);
router.post("/unsubscribe", controller.unsubscribe);
router.get("/deliveries", controller.listDeliveries);
router.post("/process", controller.process);

module.exports = router;
