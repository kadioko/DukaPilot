const router = require("express").Router();
const { authenticate, requireRole } = require("../middleware/auth");
const { list } = require("../controllers/notification.controller");

router.get("/", authenticate, requireRole("MERCHANT"), list);

module.exports = router;
