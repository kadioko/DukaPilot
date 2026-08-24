const router = require("express").Router();
const { authenticate, requireRole } = require("../middleware/auth");
const { getMyReferrals } = require("../controllers/referral.controller");

router.get("/mine", authenticate, requireRole("MERCHANT"), getMyReferrals);

module.exports = router;
