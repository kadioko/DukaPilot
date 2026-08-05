const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;

// Express resolves req.ip through the single trusted Railway proxy configured
// in app.js. Reading X-Forwarded-For directly lets callers spoof rate keys.
function getClientKey(req) {
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
};

const apiRateLimiter = rateLimit({
  ...sharedOptions,
  windowMs: 15 * 60 * 1000,
  // Browser traffic is proxied through Vercel, and Tanzanian mobile networks
  // commonly place many customers behind one public IP. Keep this broad
  // safety net high; sensitive authentication has its own strict limiter.
  max: 5000,
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
  max: 1000,
  message: { error: "Too many requests to the public catalog. Please wait a few minutes and try again." },
});

module.exports = { apiRateLimiter, authRateLimiter, publicRateLimiter };
