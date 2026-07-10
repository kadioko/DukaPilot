const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;

// Extract real client IP from x-forwarded-for (set by Railway's proxy)
function getClientKey(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return ipKeyGenerator(forwardedFor.split(",")[0].trim());
  }
  return ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown");
}

function getAuthenticationKey(req) {
  const phone = String(req.body?.phone || "no-phone").replace(/\D/g, "").slice(-12) || "no-phone";
  return `${getClientKey(req)}:${phone}`;
}

const sharedOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  validate: { xForwardedForHeader: false },
};

const apiRateLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: "Too many requests. Please wait a few minutes and try again." },
});

const authRateLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: getAuthenticationKey,
  message: { error: "Too many authentication attempts. Please wait 15 minutes and try again." },
});

const publicRateLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: "Too many requests to the public catalog. Please wait a few minutes and try again." },
});

module.exports = { apiRateLimiter, authRateLimiter, publicRateLimiter };
