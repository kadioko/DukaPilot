const router = require("express").Router();
const { list, create, update } = require("../controllers/staff.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canManageStaff"));

router.get("/", list);
router.post("/", create);
router.patch("/:id", update);

module.exports = router;
