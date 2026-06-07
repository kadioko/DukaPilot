const jwt = require("jsonwebtoken");

function readCookieToken(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index >= 0 ? [part.slice(0, index), decodeURIComponent(part.slice(index + 1))] : [part, ""];
      })
  );

  return cookies.dukapilot_token || cookies.dukaos_token || null;
}

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const bearerToken = header && header.startsWith("Bearer ") ? header.slice(7) : null;
  const token = bearerToken || readCookieToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user.role === "ADMIN") return next();
    if (!req.user.staffId) return next();

    const permissions = req.user.permissions || {};
    if (!permissions[permission]) {
      return res.status(403).json({ error: "You do not have permission for this action" });
    }
    next();
  };
}

module.exports = { authenticate, requireRole, requirePermission, readCookieToken };
