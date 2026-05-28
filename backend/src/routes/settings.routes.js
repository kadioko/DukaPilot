const router = require("express").Router();
const { getSettings, updateShop, updateLanguage, changePin, updateProfile } = require("../controllers/settings.controller");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);

router.get("/", getSettings);
router.patch("/shop", updateShop);
router.patch("/language", updateLanguage);
router.patch("/pin", changePin);
router.patch("/profile", updateProfile);

module.exports = router;
