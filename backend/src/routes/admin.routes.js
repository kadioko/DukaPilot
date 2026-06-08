const router = require("express").Router();
const { overview, listUsers, listAuditLogs, resetUserPin, resetStaffPin, findUserByPhone, findStaffByPhone } = require("../controllers/admin.controller");
const { authenticate, requireRole } = require("../middleware/auth");

router.use(authenticate);
router.use(requireRole("ADMIN"));

router.get("/overview", overview);
router.get("/users", listUsers);
router.get("/users/search", findUserByPhone);
router.get("/staff/search", findStaffByPhone);
router.post("/users/:userId/reset-pin", resetUserPin);
router.post("/staff/:staffId/reset-pin", resetStaffPin);
router.get("/audit-logs", listAuditLogs);

module.exports = router;
