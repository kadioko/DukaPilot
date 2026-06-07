const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const { issueOtp, verifyOtp } = require("../services/otp.service");

const VALID_ROLES = new Set(["MERCHANT", "SUPPLIER"]);
const VALID_LANGUAGES = new Set(["en", "sw"]);

// Access token: 1 hour. Refresh token: 30 days.
const ACCESS_TOKEN_EXPIRY = "1h";
const REFRESH_TOKEN_EXPIRY = "30d";
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function normalizePhone(value) {
  return String(value || "").replace(/[\s()-]/g, "").trim();
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validatePhone(phone) {
  return /^\+?[1-9]\d{8,14}$/.test(phone);
}

function validatePin(pin) {
  return /^\d{4,8}$/.test(pin);
}

function getCookieOptions(maxAge) {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: secure ? "none" : "lax",
    secure,
    path: "/",
    maxAge,
  };
}

function setCookie(res, name, value, maxAge) {
  const options = getCookieOptions(maxAge);
  const cookie = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${Math.floor(options.maxAge / 1000)}`,
    `Path=${options.path}`,
    `SameSite=${options.sameSite}`,
    options.httpOnly ? "HttpOnly" : "",
    options.secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
  const existing = res.getHeader("Set-Cookie");
  const cookies = Array.isArray(existing) ? existing : existing ? [existing] : [];
  res.setHeader("Set-Cookie", [...cookies, cookie]);
}

function clearCookie(res, name) {
  const options = getCookieOptions(0);
  const cookie = [
    `${name}=`,
    "Max-Age=0",
    `Path=${options.path}`,
    `SameSite=${options.sameSite}`,
    options.httpOnly ? "HttpOnly" : "",
    options.secure ? "Secure" : "",
  ].filter(Boolean).join("; ");
  res.setHeader("Set-Cookie", cookie);
}

function setAuthCookies(res, accessToken, refreshToken) {
  setCookie(res, "dukapilot_token", accessToken, 60 * 60 * 1000); // 1h
  setCookie(res, "dukapilot_refresh", refreshToken, REFRESH_TOKEN_EXPIRY_MS); // 30d
  clearCookie(res, "dukaos_token");
  clearCookie(res, "dukaos_refresh");
}

function clearAuthCookies(res) {
  clearCookie(res, "dukapilot_token");
  clearCookie(res, "dukapilot_refresh");
  clearCookie(res, "dukaos_token");
  clearCookie(res, "dukaos_refresh");
}

// Legacy alias for code that only sets one cookie
function setAuthCookie(res, token) {
  setAuthCookies(res, token, token);
}

function clearAuthCookie(res) {
  clearAuthCookies(res);
}

function issueAccessToken(user) {
  return jwt.sign(
    { userId: user.id, phone: user.phone, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function issueRefreshToken(user) {
  return jwt.sign(
    { userId: user.id, type: "refresh" },
    process.env.JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

// Keep legacy issueToken for any other callers
function issueToken(user) {
  return issueAccessToken(user);
}

const register = asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const pin = String(req.body.pin || "").trim();
  const name = normalizeText(req.body.name);
  const role = normalizeText(req.body.role || "MERCHANT").toUpperCase();
  const shopName = normalizeText(req.body.shopName);
  const shopLocation = normalizeText(req.body.shopLocation);
  const shopCategory = normalizeText(req.body.shopCategory);
  const shopDistrict = normalizeText(req.body.shopDistrict);

  if (!phone || !pin || !name) {
    return res.status(400).json({ error: "Phone, PIN, and name are required" });
  }

  if (!validatePhone(phone)) {
    return res.status(400).json({ error: "Enter a valid phone number" });
  }

  if (!validatePin(pin)) {
    return res.status(400).json({ error: "PIN must be 4 to 8 digits" });
  }

  if (!VALID_ROLES.has(role)) {
    return res.status(400).json({ error: "Invalid role selected" });
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return res.status(409).json({ error: "Phone number already registered" });
  }

  const hashedPin = await bcrypt.hash(pin, 10);

  const user = await prisma.user.create({
    data: {
      phone,
      pin: hashedPin,
      name,
      role,
    },
  });

  if (role === "MERCHANT") {
    await prisma.shop.create({
      data: {
        name: shopName || `${name}'s Duka`,
        location: shopLocation || "Dar es Salaam",
        district: shopDistrict || null,
        category: shopCategory || "general",
        userId: user.id,
      },
    });
  }

  if (role === "SUPPLIER") {
    await prisma.supplier.create({
      data: {
        name,
        phone,
        userId: user.id,
      },
    });
  }

  const accessToken = issueAccessToken(user);
  const refreshToken = issueRefreshToken(user);
  const profile = await getProfile(user.id);
  setAuthCookies(res, accessToken, refreshToken);
  req.audit = { action: "auth.register", resourceType: "user", resourceId: user.id, metadata: { role: user.role } };
  res.status(201).json({ token: accessToken, user: profile });
});

const login = asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const pin = String(req.body.pin || "").trim();

  if (!phone || !pin) {
    return res.status(400).json({ error: "Phone and PIN required" });
  }

  if (!validatePhone(phone)) {
    return res.status(400).json({ error: "Enter a valid phone number" });
  }

  if (!validatePin(pin)) {
    return res.status(400).json({ error: "PIN must be 4 to 8 digits" });
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) {
    return res.status(401).json({ error: "Invalid phone or PIN" });
  }

  const match = await bcrypt.compare(pin, user.pin);
  if (!match) {
    return res.status(401).json({ error: "Invalid phone or PIN" });
  }

  const accessToken = issueAccessToken(user);
  const refreshToken = issueRefreshToken(user);
  const profile = await getProfile(user.id);
  setAuthCookies(res, accessToken, refreshToken);
  req.audit = { action: "auth.login", resourceType: "user", resourceId: user.id, metadata: { role: user.role } };
  res.json({ token: accessToken, user: profile });
});

const me = asyncHandler(async (req, res) => {
  const profile = await getProfile(req.user.userId);
  if (!profile) return res.status(404).json({ error: "User not found" });
  res.json({ user: profile });
});

const updateLanguage = asyncHandler(async (req, res) => {
  const language = normalizeText(req.body.language).toLowerCase();

  if (!VALID_LANGUAGES.has(language)) {
    return res.status(400).json({ error: "Language must be 'en' or 'sw'" });
  }

  await prisma.user.update({
    where: { id: req.user.userId },
    data: { language },
  });
  req.audit = { action: "auth.language.update", resourceType: "user", resourceId: req.user.userId, metadata: { language } };
  res.json({ message: "Language updated" });
});

const logout = asyncHandler(async (req, res) => {
  clearAuthCookies(res);
  req.audit = { action: "auth.logout", resourceType: "session", resourceId: req.user?.userId || null };
  res.json({ message: "Logged out" });
});

// POST /api/auth/refresh — issue new access token from refresh token cookie or body
const refresh = asyncHandler(async (req, res) => {
  const cookieHeader = req.headers.cookie || "";
  const cookies = Object.fromEntries(
    cookieHeader.split(";").map((p) => {
      const idx = p.indexOf("=");
      return idx >= 0 ? [p.slice(0, idx).trim(), decodeURIComponent(p.slice(idx + 1))] : [p.trim(), ""];
    })
  );

  const refreshToken = cookies.dukapilot_refresh || cookies.dukaos_refresh || req.body?.refreshToken;
  if (!refreshToken) return res.status(401).json({ error: "Refresh token required" });

  let payload;
  try {
    payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }

  if (payload.type !== "refresh") {
    return res.status(401).json({ error: "Invalid token type" });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) return res.status(401).json({ error: "User not found" });

  const newAccessToken = issueAccessToken(user);
  setCookie(res, "dukapilot_token", newAccessToken, 60 * 60 * 1000);
  clearCookie(res, "dukaos_token");
  res.json({ token: newAccessToken });
});

// POST /api/auth/otp/request — send OTP to phone for PIN recovery
const requestOtp = asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);

  if (!validatePhone(phone)) {
    return res.status(400).json({ error: "Enter a valid phone number" });
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  // Don't reveal whether phone exists — always return success
  if (user) {
    try {
      await issueOtp(phone);
    } catch (err) {
      console.error("OTP send error:", err.message);
      // Don't expose internal error to client
    }
  }

  res.json({ message: "If this number is registered, an OTP has been sent." });
});

// POST /api/auth/otp/verify-reset — verify OTP and reset PIN
const verifyOtpAndResetPin = asyncHandler(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const code = String(req.body.code || "").trim();
  const newPin = String(req.body.newPin || "").trim();

  if (!phone || !code || !newPin) {
    return res.status(400).json({ error: "phone, code, and newPin are required" });
  }

  if (!validatePhone(phone)) {
    return res.status(400).json({ error: "Enter a valid phone number" });
  }

  if (!validatePin(newPin)) {
    return res.status(400).json({ error: "New PIN must be 4 to 8 digits" });
  }

  // verifyOtp throws synchronously on failure -- catch to return 400
  try {
    verifyOtp(phone, code);
  } catch (err) {
    return res.status(400).json({ error: err.message || "Invalid or expired OTP" });
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const hashedPin = await bcrypt.hash(newPin, 10);
  await prisma.user.update({ where: { id: user.id }, data: { pin: hashedPin } });

  req.audit = { action: "auth.pin.resetViaOtp", resourceType: "user", resourceId: user.id };
  res.json({ message: "PIN reset successfully. You can now log in with your new PIN." });
});

async function getProfile(userId) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      name: true,
      role: true,
      language: true,
      shop: { select: { id: true, name: true, location: true, district: true, category: true } },
      supplier: { select: { id: true, name: true, phone: true, address: true } },
      createdAt: true,
    },
  });
}

module.exports = { register, login, me, updateLanguage, logout, refresh, requestOtp, verifyOtpAndResetPin, issueToken, setAuthCookie, clearAuthCookie };
