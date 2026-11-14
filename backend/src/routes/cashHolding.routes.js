const router = require("express").Router();
const { authenticate, requireRole } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const controller = require("../controllers/cashHolding.controller");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use((req, res, next) => {
  if (req.user.staffId) return res.status(403).json({ error: "Only the business owner can access cash on hand" });
  if (process.env.CASH_HOLDING_ENABLED !== "true") return res.status(503).json({ error: "Cash on hand is not available yet" });
  return next();
});
router.get("/", controller.current);
router.get("/handovers", controller.handovers);
router.post("/count", requireActiveSubscription, controller.count);
router.post("/movements", requireActiveSubscription, controller.movement);

module.exports = router;
