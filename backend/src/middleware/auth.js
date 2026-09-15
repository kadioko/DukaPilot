const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { getFarmConfiguration } = require("../lib/farmAccess");

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

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  const bearerToken = header && header.startsWith("Bearer ") ? header.slice(7) : null;
  const cookieToken = readCookieToken(req);
  const token = bearerToken || cookieToken;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    // Supports a smooth move away from browser-stored bearer tokens: if an
    // older client sends a stale bearer token, its valid HttpOnly cookie wins.
    if (!bearerToken || !cookieToken) return res.status(401).json({ error: "Invalid or expired token" });
    try {
      payload = jwt.verify(cookieToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  }

  try {
    const account = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, sessionVersion: true },
    });
    if (!account) return res.status(401).json({ error: "Account access expired" });
    payload.accountRole = account.role;
    payload.role = account.role;
    if (payload.staffId) {
      const staff = await prisma.staffMember.findFirst({
        where: { id: payload.staffId, isActive: true },
        select: {
          id: true,
          sessionVersion: true,
          role: true,
          shopId: true,
          canSell: true,
          canManageStock: true,
          canManageStaff: true,
          canViewReports: true,
          canRecordExpenses: true,
          canManageCashSessions: true,
          canUseAssistant: true,
          canManageFarm: true,
          canViewQuotations: true,
          canCreateQuotations: true,
          canEditSentQuotations: true,
          canViewQuotationCosts: true,
          canApproveQuotationDiscounts: true,
          canSendQuotations: true,
          canAcceptQuotations: true,
          canConvertQuotations: true,
          canRecordQuotationPayments: true,
          canArchiveQuotations: true,
          canDeleteQuotationDrafts: true,
          shop: { select: { userId: true, parentShopId: true, branchArchived: true, parentShop: { select: { userId: true } } } },
        },
      });
      if (!staff || (staff.shop.userId || staff.shop.parentShop?.userId) !== payload.userId) {
        return res.status(401).json({ error: "Staff access expired" });
      }
      if (staff.shop.parentShopId && staff.shop.branchArchived) return res.status(403).json({ error: "This branch is archived" });
      if (payload.sessionVersion !== staff.sessionVersion) return res.status(401).json({ error: "Session expired" });
      payload.shopId = staff.shopId;
      payload.businessShopId = staff.shop.parentShopId || staff.shopId;
      // A staff session is a merchant actor even when the shop owner also has
      // platform-admin access. Never inherit the owner's platform privileges.
      payload.role = "MERCHANT";
      const requested = req.headers["x-dukapilot-branch"];
      if (requested && requested !== staff.shopId) return res.status(403).json({ error: "Staff can only access their assigned branch" });
      payload.staffRole = staff.role;
      payload.permissions = {
        canSell: staff.canSell,
        canManageStock: staff.canManageStock,
        canManageStaff: staff.canManageStaff,
        canViewReports: staff.canViewReports,
        canRecordExpenses: staff.canRecordExpenses,
        canManageCashSessions: staff.canManageCashSessions,
        canUseAssistant: staff.canUseAssistant,
        canManageFarm: staff.canManageFarm,
        canViewQuotations: staff.canViewQuotations,
        canCreateQuotations: staff.canCreateQuotations,
        canEditSentQuotations: staff.canEditSentQuotations,
        canViewQuotationCosts: staff.canViewQuotationCosts,
        canApproveQuotationDiscounts: staff.canApproveQuotationDiscounts,
        canSendQuotations: staff.canSendQuotations,
        canAcceptQuotations: staff.canAcceptQuotations,
        canConvertQuotations: staff.canConvertQuotations,
        canRecordQuotationPayments: staff.canRecordQuotationPayments,
        canArchiveQuotations: staff.canArchiveQuotations,
        canDeleteQuotationDrafts: staff.canDeleteQuotationDrafts,
      };
    } else if (payload.sessionVersion !== account.sessionVersion) return res.status(401).json({ error: "Session expired" });
    payload.requestedShopId = typeof req.headers["x-dukapilot-branch"] === "string" ? req.headers["x-dukapilot-branch"] : undefined;
    if (payload.requestedShopId && !payload.staffId) {
      if (payload.requestedShopId.length > 100) return res.status(400).json({ error: "Invalid branch" });
      payload.resolvedShopId = await getShopIdForUser(payload);
    }
    req.user = payload;
    next();
  } catch (error) {
    next(error);
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (roles.includes("ADMIN") && req.user.staffId) {
      return res.status(403).json({ error: "Platform admin access is not available to staff sessions" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (req.user.role === "ADMIN" && !req.user.staffId) return next();
    if (!req.user.staffId) return next();

    const permissions = req.user.permissions || {};
    if (!permissions[permission]) {
      return res.status(403).json({ error: "You do not have permission for this action" });
    }
    next();
  };
}

function requireAnyPermission(...permissions) {
  return (req, res, next) => {
    if ((req.user.role === "ADMIN" && !req.user.staffId) || !req.user.staffId) return next();

    const granted = req.user.permissions || {};
    if (!permissions.some((permission) => granted[permission])) {
      return res.status(403).json({ error: "You do not have permission for this action" });
    }
    next();
  };
}

function requireShopCategory(...categories) {
  const allowedCategories = new Set(categories.map((category) => String(category).toLowerCase()));
  return async (req, res, next) => {
    try {
      const shopId = await getShopIdForUser(req.user);
      const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { category: true } });
      if (!shop || !allowedCategories.has(String(shop.category || "").toLowerCase())) {
        return res.status(403).json({ error: "This feature is not available for this business category. You can change the shop category in Settings." });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function requireFarmCategory() {
  return async (req, res, next) => {
    try {
      const shopId = await getShopIdForUser(req.user);
      const configuration = await getFarmConfiguration(shopId);
      if (!configuration?.isFarm) {
        return res.status(403).json({ error: "Farm operations are available after choosing Farm / Agriculture in Settings." });
      }
      req.farmConfiguration = configuration;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function requireFarmMode(mode) {
  const normalizedMode = String(mode || "").toUpperCase();
  const settingKey = normalizedMode === "CROPS" ? "hasCrops" : "hasLivestock";
  return async (req, res, next) => {
    try {
      const shopId = await getShopIdForUser(req.user);
      const configuration = await getFarmConfiguration(shopId);
      if (!configuration?.isFarm || !configuration[settingKey]) {
        const label = normalizedMode === "CROPS" ? "Crops" : "Livestock";
        return res.status(403).json({ error: `${label} operations are not enabled for this farm. Update the farm setup first.` });
      }
      req.farmConfiguration = configuration;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { authenticate, requireRole, requirePermission, requireAnyPermission, requireShopCategory, requireFarmCategory, requireFarmMode, readCookieToken };
