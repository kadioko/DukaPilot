const router = require("express").Router();
const { list, create, update, remove, recordRecurring, updateRecurring, removeRecurring } = require("../controllers/expense.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canRecordExpenses"));
router.use(requireActiveSubscription);

router.get("/", list);
router.post("/", create);
router.post("/recurring/:id/record", recordRecurring);
router.patch("/recurring/:id", updateRecurring);
router.delete("/recurring/:id", removeRecurring);
router.patch("/:id", update);
router.delete("/:id", remove);

module.exports = router;
