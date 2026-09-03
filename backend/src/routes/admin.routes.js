const router = require("express").Router();
const { overview, listUsers, listAuditLogs, deleteUser, resetUserPin, resetStaffPin, findUserByPhone, findStaffByPhone, smsMonitoring, completeWhatsAppCoexistence } = require("../controllers/admin.controller");
const { adminListReferrals, adminRewardReferral, adminRecoverReferral, adminRejectReferral } = require("../controllers/referral.controller");
const { authenticate, requireRole } = require("../middleware/auth");

router.use(authenticate);
router.use(requireRole("ADMIN"));

router.get("/overview", overview);
router.get("/users", listUsers);
router.get("/users/search", findUserByPhone);
router.get("/staff/search", findStaffByPhone);
router.delete("/users/:userId", deleteUser);
router.post("/users/:userId/reset-pin", resetUserPin);
router.post("/staff/:staffId/reset-pin", resetStaffPin);
router.get("/audit-logs", listAuditLogs);
router.get("/sms-monitoring", smsMonitoring);
router.post("/whatsapp/coexistence/complete", completeWhatsAppCoexistence);
router.get("/referrals", adminListReferrals);
router.post("/referrals/recover", adminRecoverReferral);
router.post("/referrals/:referralId/reward", adminRewardReferral);
router.post("/referrals/:referralId/reject", adminRejectReferral);

module.exports = router;
