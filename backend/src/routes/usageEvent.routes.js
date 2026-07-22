const router = require("express").Router();
const { authenticate, requireRole } = require("../middleware/auth");
const controller = require("../controllers/usageEvent.controller");

router.use(authenticate);
router.use(requireRole("MERCHANT"));
router.post("/", controller.create);
router.get("/", controller.list);

module.exports = router;
