const router = require("express").Router();
const controller = require("../controllers/crop.controller");
const { authenticate, requireRole, requirePermission, requireFarmMode } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requireActiveSubscription);
router.use(requireFarmMode("CROPS"));
router.use(requirePermission("canManageFarm"));

router.get("/", controller.overview);
router.get("/products", controller.listProducts);
router.get("/operations", controller.operationsOverview);
router.post("/plots", controller.createPlot);
router.post("/cycles", controller.createCycle);
router.patch("/cycles/:id", controller.updateCycle);
router.post("/inputs", controller.recordInput);
router.post("/harvests", controller.recordHarvest);
router.post("/starter-products", controller.createStarterProducts);
router.post("/irrigation", controller.recordIrrigation);
router.post("/tasks", controller.createTask);
router.patch("/tasks/:id", controller.updateTask);
router.put("/budgets/:cycleId", controller.saveBudget);
router.post("/contracts", controller.createBuyerContract);
router.patch("/contracts/:id", controller.updateBuyerContract);
router.post("/harvests/:id/grades", controller.recordHarvestGrade);
router.post("/weather-alerts", controller.createWeatherAlert);
router.patch("/weather-alerts/:id", controller.updateWeatherAlert);

module.exports = router;
