const express = require("express");
const { authenticate, requireRole } = require("../middleware/auth");
const {
  getStatus,
  adminListSubscriptions,
  adminUpdateSubscription,
  adminExtendTrial,
  adminExtendSubscription,
  adminRemoveSubscription,
  adminRecordPayment,
} = require("../controllers/subscription.controller");

const router = express.Router();

// Merchant: check own subscription
router.get("/status", authenticate, getStatus);

// Admin routes
router.get("/admin", authenticate, requireRole("ADMIN"), adminListSubscriptions);
router.patch("/admin/:shopId", authenticate, requireRole("ADMIN"), adminUpdateSubscription);
router.delete("/admin/:shopId", authenticate, requireRole("ADMIN"), adminRemoveSubscription);
router.post("/admin/:shopId/extend-trial", authenticate, requireRole("ADMIN"), adminExtendTrial);
router.post("/admin/:shopId/extend-subscription", authenticate, requireRole("ADMIN"), adminExtendSubscription);
router.post("/admin/:shopId/payments", authenticate, requireRole("ADMIN"), adminRecordPayment);

module.exports = router;
