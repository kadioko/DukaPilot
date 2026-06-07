const router = require("express").Router();
const { getSettings, updateShop, updateLanguage, changePin, updateProfile } = require("../controllers/settings.controller");
const { authenticate, requirePermission } = require("../middleware/auth");

router.use(authenticate);

router.get("/", getSettings);
router.patch("/shop", requirePermission("canManageStaff"), updateShop);
router.patch("/language", updateLanguage);
router.patch("/pin", requirePermission("canManageStaff"), changePin);
router.patch("/profile", requirePermission("canManageStaff"), updateProfile);

module.exports = router;
