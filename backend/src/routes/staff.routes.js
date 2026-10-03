const router = require("express").Router();
const { list, create, update, remove } = require("../controllers/staff.controller");
const { authenticate, requireRole, requirePermission } = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const { requireFeature } = require("../lib/entitlements");

router.use(authenticate);
router.use(requireRole("MERCHANT", "ADMIN"));
router.use(requirePermission("canManageStaff"));
router.use(requireActiveSubscription);
router.use(requireFeature("STAFF"));

router.get("/", list);
router.post("/", create);
router.patch("/:id", update);
router.delete("/:id", remove);

module.exports = router;
