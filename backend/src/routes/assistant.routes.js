const router = require("express").Router();
const ctrl = require("../controllers/assistant.controller");
const { authenticate, requireRole } = require("../middleware/auth");

router.use(authenticate);
router.use(requireRole("MERCHANT"));

router.get("/actions", ctrl.listActions);
router.post("/actions", ctrl.trackAction);

module.exports = router;
