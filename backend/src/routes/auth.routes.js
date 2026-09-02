const router = require("express").Router();
const { register, login, me, updateLanguage, logout, refresh, requestOtp, otpChannels, verifyOtpAndResetPin } = require("../controllers/auth.controller");
const { authenticate } = require("../middleware/auth");
const { authRateLimiter, otpRequestRateLimiter } = require("../middleware/rateLimit");

router.post("/register", authRateLimiter, register);
router.post("/login", authRateLimiter, login);
router.post("/logout", authenticate, logout);
router.get("/me", authenticate, me);
router.patch("/language", authenticate, updateLanguage);
router.post("/refresh", refresh);
router.get("/otp/channels", otpChannels);
router.post("/otp/request", otpRequestRateLimiter, requestOtp);
router.post("/otp/verify-reset", authRateLimiter, verifyOtpAndResetPin);

module.exports = router;
