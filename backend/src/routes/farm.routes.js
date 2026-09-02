const router = require("express").Router();
const controller = require("../controllers/farm.controller");
const { authenticate, requireRole, requirePermission, requireShopCategory } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requireActiveSubscription);
router.use(requireShopCategory("livestock"));

router.get("/", requirePermission("canManageFarm"), controller.overview);
router.post("/profiles", requirePermission("canManageFarm"), controller.saveProfiles);
router.post("/groups", requirePermission("canManageFarm"), controller.createGroup);
router.post("/groups/:id/events", requirePermission("canManageFarm"), controller.recordAnimalEvent);
router.post("/production", requirePermission("canManageFarm"), controller.createProduction);
router.post("/pack", requirePermission("canManageFarm"), controller.packOutput);

module.exports = router;
