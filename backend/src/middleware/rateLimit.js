const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;
const { RedisStore } = require("rate-limit-redis");
const { getRedisClient } = require("../lib/redis");

// Express resolves req.ip through the single trusted Railway proxy configured
// in app.js. Reading X-Forwarded-For directly lets callers spoof rate keys.
function getClientKey(req) {
  return ipKeyGenerator(req.ip || req.socket?.remoteAddress || "unknown");
}

function getAuthenticationKey(req) {
  const phone = String(req.body?.phone || "no-phone").replace(/\D/g, "").slice(-12) || "no-phone";
  return `${getClientKey(req)}:${phone}`;
}

function getPublicEventKey(req) {
  const sessionId = String(req.body?.sessionId || "no-session").slice(0, 80);
  return `${getClientKey(req)}:${sessionId}`;
}

function getPublicOrderKey(req) {
  const shopId = String(req.body?.shopId || "no-shop").slice(0, 80);
  const phone = String(req.body?.customerPhone || "no-phone").replace(/\D/g, "").slice(-12) || "no-phone";
  return `${getClientKey(req)}:${shopId}:${phone}`;
}

const sharedOptions = {
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey,
};

function sharedStore(name) {
  const redis = getRedisClient();
  if (!redis) return undefined;
  return new RedisStore({
    prefix: `dukapilot:rate-limit:${name}:`,
    sendCommand: (...args) => redis.sendCommand(args),
  });
}

const apiRateLimiter = rateLimit({
  ...sharedOptions,
  store: sharedStore("api"),
  windowMs: 15 * 60 * 1000,
  // Browser traffic is proxied through Vercel, and Tanzanian mobile networks
  // commonly place many customers behind one public IP. Keep this broad
  // safety net high; sensitive authentication has its own strict limiter.
  max: 5000,
  message: { error: "Too many requests. Please wait a few minutes and try again." },
});

const authRateLimiter = rateLimit({
  ...sharedOptions,
  store: sharedStore("auth"),
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: getAuthenticationKey,
  message: { error: "Too many authentication attempts. Please wait 15 minutes and try again." },
});

const publicRateLimiter = rateLimit({
  ...sharedOptions,
  store: sharedStore("public"),
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: "Too many requests to the public catalog. Please wait a few minutes and try again." },
});

const publicEventRateLimiter = rateLimit({
  ...sharedOptions,
  store: sharedStore("event"),
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: getPublicEventKey,
  message: { error: "Too many marketing events. Please try again shortly." },
});

const publicOrderRateLimiter = rateLimit({
  ...sharedOptions,
  store: sharedStore("order"),
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyGenerator: getPublicOrderKey,
  message: { error: "Too many order attempts. Please wait a few minutes and try again." },
});

const statusRateLimiter = rateLimit({
  ...sharedOptions,
  store: sharedStore("status"),
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Too many service-status checks. Please try again shortly." },
});

const otpRequestRateLimiter = rateLimit({
  ...sharedOptions,
  store: sharedStore("otp"),
  windowMs: 15 * 60 * 1000,
  max: 3,
  keyGenerator: getAuthenticationKey,
  message: { error: "Too many PIN reset requests. Please wait 15 minutes and try again." },
});

module.exports = { apiRateLimiter, authRateLimiter, publicRateLimiter, publicEventRateLimiter, publicOrderRateLimiter, otpRequestRateLimiter, statusRateLimiter };
