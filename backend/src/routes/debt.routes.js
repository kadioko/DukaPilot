const router = require("express").Router();
const { list, create, update, recordPayment } = require("../controllers/debt.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canSell"));
router.use(requireActiveSubscription);

router.get("/", list);
router.post("/", create);
router.patch("/:id", update);
router.post("/:id/payments", recordPayment);

module.exports = router;
