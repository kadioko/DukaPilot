const router = require("express").Router();
const { list, get, updateStatus } = require("../controllers/customerOrder.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canSell"));
router.use(requireActiveSubscription);

router.get("/", list);
router.get("/:id", get);
router.patch("/:id/status", updateStatus);

module.exports = router;
