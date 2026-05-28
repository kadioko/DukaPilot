const rateLimit = require("express-rate-limit");

function getClientKey(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || "unknown";
}

const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  message: {
    error: "Too many requests. Please wait a few minutes and try again.",
  },
});

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  message: {
    error: "Too many authentication attempts. Please wait 15 minutes and try again.",
  },
});

const publicRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
  message: {
    error: "Too many requests to the public catalog. Please wait a few minutes and try again.",
  },
});

module.exports = { apiRateLimiter, authRateLimiter, publicRateLimiter };
