const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");
const { getShopIdForUser } = require("../lib/shopAccess");
const { normalizePhone, phoneLookupValues } = require("../lib/phone");
const { activePlan } = require("../lib/entitlements");

const DEFAULT_STAFF_PIN = "1234";

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const ROLES = new Set(["OWNER", "MANAGER", "CASHIER", "STOCK_CLERK"]);
const SAFE_STAFF_SELECT = {
  id: true,
  name: true,
  phone: true,
  role: true,
  canSell: true,
  canManageStock: true,
  canManageStaff: true,
  canViewReports: true,
  canRecordExpenses: true,
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
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

function permissionsFor(role) {
  const quotationManager = { canViewQuotations: true, canCreateQuotations: true, canEditSentQuotations: true, canViewQuotationCosts: true, canApproveQuotationDiscounts: true, canSendQuotations: true, canAcceptQuotations: true, canConvertQuotations: true, canRecordQuotationPayments: true, canArchiveQuotations: true, canDeleteQuotationDrafts: true };
  if (role === "OWNER") return { canSell: true, canManageStock: true, canManageStaff: true, canViewReports: true, canRecordExpenses: true, ...quotationManager };
  if (role === "MANAGER") return { canSell: true, canManageStock: true, canManageStaff: true, canViewReports: true, canRecordExpenses: true, ...quotationManager };
  if (role === "STOCK_CLERK") return { canSell: false, canManageStock: true, canManageStaff: false, canViewReports: false, canRecordExpenses: false, canViewQuotations: true, canCreateQuotations: false, canEditSentQuotations: false, canViewQuotationCosts: false, canApproveQuotationDiscounts: false, canSendQuotations: false, canAcceptQuotations: false, canConvertQuotations: false, canRecordQuotationPayments: false, canArchiveQuotations: false, canDeleteQuotationDrafts: false };
  return { canSell: true, canManageStock: false, canManageStaff: false, canViewReports: false, canRecordExpenses: false, canViewQuotations: false, canCreateQuotations: false, canEditSentQuotations: false, canViewQuotationCosts: false, canApproveQuotationDiscounts: false, canSendQuotations: false, canAcceptQuotations: false, canConvertQuotations: false, canRecordQuotationPayments: false, canArchiveQuotations: false, canDeleteQuotationDrafts: false };
}

function boolValue(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function validatePin(pin) {
  return /^\d{4,8}$/.test(String(pin || "").trim());
}

async function phoneConflict(phone, excludeStaffId = null) {
  if (!phone) return false;
  const phoneValues = phoneLookupValues(phone);
  const [user, staff] = await Promise.all([
    prisma.user.findFirst({ where: { phone: { in: phoneValues } }, select: { id: true } }),
    prisma.staffMember.findFirst({ where: { phone: { in: phoneValues } }, select: { id: true } }),
  ]);
  return Boolean(user || (staff && staff.id !== excludeStaffId));
}

async function basicStaffLimitReached(shopId, excludeStaffId = null) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { plan: true, trialEndsAt: true, subscriptionEndsAt: true, isActive: true },
  });
  if (activePlan(shop) !== "BASIC") return false;
  const where = { shopId, isActive: true };
  if (excludeStaffId) where.id = { not: excludeStaffId };
  return (await prisma.staffMember.count({ where })) >= 1;
}

function basicStaffLimitError(res) {
  return res.status(403).json({
    error: "Basic includes one active staff member. Deactivate the current staff member or upgrade to Pro for more staff.",
    code: "BASIC_STAFF_LIMIT",
  });
}

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const staff = await prisma.staffMember.findMany({
    where: { shopId },
    select: SAFE_STAFF_SELECT,
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  res.json({ staff });
});

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const name = String(req.body.name || "").trim();
  const role = String(req.body.role || "CASHIER").toUpperCase();
  const phone = normalizePhone(req.body.phone);
  const pin = String(req.body.pin || DEFAULT_STAFF_PIN).trim();
  if (!name) return res.status(400).json({ error: "Staff name is required" });
  if (!phone) return res.status(400).json({ error: "Staff phone is required for login" });
  if (!ROLES.has(role)) return res.status(400).json({ error: "Invalid staff role" });
  if (!validatePin(pin)) return res.status(400).json({ error: "Staff PIN must be 4 to 8 digits" });
  if (await phoneConflict(phone)) return res.status(409).json({ error: "This phone number already belongs to another DukaPilot login" });
  if (await basicStaffLimitReached(shopId)) return basicStaffLimitError(res);

  const defaults = permissionsFor(role);
  const staff = await prisma.staffMember.create({
    data: {
      name,
      phone,
      pin: await bcrypt.hash(pin, 10),
      role,
      canSell: boolValue(req.body.canSell, defaults.canSell),
      canManageStock: boolValue(req.body.canManageStock, defaults.canManageStock),
      canManageStaff: boolValue(req.body.canManageStaff, defaults.canManageStaff),
      canViewReports: boolValue(req.body.canViewReports, defaults.canViewReports),
      canRecordExpenses: boolValue(req.body.canRecordExpenses, defaults.canRecordExpenses),
      canViewQuotations: boolValue(req.body.canViewQuotations, defaults.canViewQuotations),
      canCreateQuotations: boolValue(req.body.canCreateQuotations, defaults.canCreateQuotations),
      canEditSentQuotations: boolValue(req.body.canEditSentQuotations, defaults.canEditSentQuotations),
      canViewQuotationCosts: boolValue(req.body.canViewQuotationCosts, defaults.canViewQuotationCosts),
      canApproveQuotationDiscounts: boolValue(req.body.canApproveQuotationDiscounts, defaults.canApproveQuotationDiscounts),
      canSendQuotations: boolValue(req.body.canSendQuotations, defaults.canSendQuotations),
      canAcceptQuotations: boolValue(req.body.canAcceptQuotations, defaults.canAcceptQuotations),
      canConvertQuotations: boolValue(req.body.canConvertQuotations, defaults.canConvertQuotations),
      canRecordQuotationPayments: boolValue(req.body.canRecordQuotationPayments, defaults.canRecordQuotationPayments),
      canArchiveQuotations: boolValue(req.body.canArchiveQuotations, defaults.canArchiveQuotations),
      canDeleteQuotationDrafts: boolValue(req.body.canDeleteQuotationDrafts, defaults.canDeleteQuotationDrafts),
      shopId,
    },
    select: SAFE_STAFF_SELECT,
  });

  req.audit = { action: "staff.create", resourceType: "staff", resourceId: staff.id };
  res.status(201).json({ staff });
});

const update = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await prisma.staffMember.findFirst({ where: { id: req.params.id, shopId } });
  if (!existing) return res.status(404).json({ error: "Staff member not found" });

  const role = String(req.body.role || existing.role).toUpperCase();
  const pin = req.body.pin === undefined ? undefined : String(req.body.pin || "").trim();
  if (!ROLES.has(role)) return res.status(400).json({ error: "Invalid staff role" });
  const nextPhone = req.body.phone === undefined ? existing.phone : normalizePhone(req.body.phone);
  if (pin !== undefined && pin && (!nextPhone || !validatePin(pin))) {
    return res.status(400).json({ error: "Staff login requires a phone and 4 to 8 digit PIN" });
  }
  if (nextPhone && nextPhone !== existing.phone && await phoneConflict(nextPhone, existing.id)) {
    return res.status(409).json({ error: "This phone number already belongs to another DukaPilot login" });
  }
  const nextIsActive = boolValue(req.body.isActive, existing.isActive);
  if (nextIsActive && !existing.isActive && await basicStaffLimitReached(shopId, existing.id)) {
    return basicStaffLimitError(res);
  }

  const staff = await prisma.staffMember.update({
    where: { id: existing.id },
    data: {
      name: req.body.name === undefined ? existing.name : String(req.body.name || "").trim(),
      phone: req.body.phone === undefined ? existing.phone : nextPhone || null,
      ...(pin !== undefined ? { pin: pin ? await bcrypt.hash(pin, 10) : null } : {}),
      role,
      canSell: boolValue(req.body.canSell, existing.canSell),
      canManageStock: boolValue(req.body.canManageStock, existing.canManageStock),
      canManageStaff: boolValue(req.body.canManageStaff, existing.canManageStaff),
      canViewReports: boolValue(req.body.canViewReports, existing.canViewReports),
      canRecordExpenses: boolValue(req.body.canRecordExpenses, existing.canRecordExpenses),
      canViewQuotations: boolValue(req.body.canViewQuotations, existing.canViewQuotations),
      canCreateQuotations: boolValue(req.body.canCreateQuotations, existing.canCreateQuotations),
      canEditSentQuotations: boolValue(req.body.canEditSentQuotations, existing.canEditSentQuotations),
      canViewQuotationCosts: boolValue(req.body.canViewQuotationCosts, existing.canViewQuotationCosts),
      canApproveQuotationDiscounts: boolValue(req.body.canApproveQuotationDiscounts, existing.canApproveQuotationDiscounts),
      canSendQuotations: boolValue(req.body.canSendQuotations, existing.canSendQuotations),
      canAcceptQuotations: boolValue(req.body.canAcceptQuotations, existing.canAcceptQuotations),
      canConvertQuotations: boolValue(req.body.canConvertQuotations, existing.canConvertQuotations),
      canRecordQuotationPayments: boolValue(req.body.canRecordQuotationPayments, existing.canRecordQuotationPayments),
      canArchiveQuotations: boolValue(req.body.canArchiveQuotations, existing.canArchiveQuotations),
      canDeleteQuotationDrafts: boolValue(req.body.canDeleteQuotationDrafts, existing.canDeleteQuotationDrafts),
      isActive: nextIsActive,
    },
    select: SAFE_STAFF_SELECT,
  });

  req.audit = { action: "staff.update", resourceType: "staff", resourceId: staff.id };
  res.json({ staff });
});

module.exports = { list, create, update };
