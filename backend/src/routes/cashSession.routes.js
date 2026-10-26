const router = require("express").Router();
const controller = require("../controllers/cashSession.controller");
const { authenticate, requireRole, requirePermission, requireAnyPermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requireAnyPermission("canSell", "canManageCashSessions"));
router.use((req, res, next) => {
  const closingExistingSession = req.method === "POST" && /^\/[^/]+\/close$/.test(req.path);
  const verifyingExistingSession = req.method === "GET" && /^\/[^/]+$/.test(req.path)
    && req.path !== "/current" && req.path !== "/history";
  if (closingExistingSession || verifyingExistingSession) return next();
  return requireActiveSubscription(req, res, next);
});
router.get("/current", controller.current);
router.get("/history", controller.history);
router.get("/:id", controller.get);
router.post("/open", requirePermission("canSell"), controller.open);
router.post("/:id/close", controller.close);

module.exports = router;
