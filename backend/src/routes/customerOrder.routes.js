const router = require("express").Router();
const { list, get, updateStatus } = require("../controllers/customerOrder.controller");
const { authenticate, requireRole } = require("../middleware/auth");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));

router.get("/", list);
router.get("/:id", get);
router.patch("/:id/status", updateStatus);

module.exports = router;
