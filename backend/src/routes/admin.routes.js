const router = require("express").Router();
const { overview, listUsers, listAuditLogs, resetUserPin, findUserByPhone } = require("../controllers/admin.controller");
const { authenticate, requireRole } = require("../middleware/auth");

router.use(authenticate);
router.use(requireRole("ADMIN"));

router.get("/overview", overview);
router.get("/users", listUsers);
router.get("/users/search", findUserByPhone);
router.post("/users/:userId/reset-pin", resetUserPin);
router.get("/audit-logs", listAuditLogs);

module.exports = router;
