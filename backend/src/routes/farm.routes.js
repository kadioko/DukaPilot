const router = require("express").Router();
const controller = require("../controllers/farm.controller");
const { authenticate, requireRole, requirePermission, requireFarmCategory, requireFarmMode } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requireActiveSubscription);
router.use(requireFarmCategory());

router.get("/", requirePermission("canManageFarm"), controller.overview);
router.post("/configuration", requirePermission("canManageFarm"), controller.saveConfiguration);
router.post("/profiles", requireFarmMode("LIVESTOCK"), requirePermission("canManageFarm"), controller.saveProfiles);
router.post("/groups", requireFarmMode("LIVESTOCK"), requirePermission("canManageFarm"), controller.createGroup);
router.post("/groups/:id/events", requireFarmMode("LIVESTOCK"), requirePermission("canManageFarm"), controller.recordAnimalEvent);
router.post("/production", requireFarmMode("LIVESTOCK"), requirePermission("canManageFarm"), controller.createProduction);
router.post("/pack", requireFarmMode("LIVESTOCK"), requirePermission("canManageFarm"), controller.packOutput);

module.exports = router;
