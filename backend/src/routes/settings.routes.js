const router = require("express").Router();
const { getSettings, updateShop, updateLanguage, changePin, updateProfile } = require("../controllers/settings.controller");
const { authenticate, requirePermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");

router.use(authenticate);

router.get("/", getSettings);
router.patch("/shop", requirePermission("canManageStaff"), requireActiveSubscription, updateShop);
router.patch("/language", updateLanguage);
router.patch("/pin", requirePermission("canManageStaff"), requireActiveSubscription, changePin);
router.patch("/profile", requirePermission("canManageStaff"), requireActiveSubscription, updateProfile);

module.exports = router;
