const router = require("express").Router();
const { list, customers, create, update, recordPayment, remove } = require("../controllers/debt.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canSell"));
router.use(requireActiveSubscription);

router.get("/", list);
router.get("/customers", customers);
router.post("/", create);
router.patch("/:id", update);
router.delete("/:id", remove);
router.post("/:id/payments", recordPayment);

module.exports = router;
