const router = require("express").Router();
const controller = require("../controllers/foodPreparation.controller");
const { authenticate, requireRole, requirePermission, requireShopCategory } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canManageStock"));
router.use(requireActiveSubscription);
router.use(requireShopCategory("bar", "restaurant"));

router.get("/", controller.list);
router.get("/recipes", controller.listRecipes);
router.post("/recipes", controller.createRecipe);
router.post("/", controller.prepare);

module.exports = router;
