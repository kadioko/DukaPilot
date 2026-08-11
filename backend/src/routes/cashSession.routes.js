const router = require("express").Router();
const controller = require("../controllers/cashSession.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canSell"));
router.use(requireActiveSubscription);
router.get("/current", controller.current);
router.post("/open", controller.open);
router.post("/:id/close", controller.close);

module.exports = router;
