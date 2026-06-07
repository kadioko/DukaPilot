const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const ROLES = new Set(["OWNER", "MANAGER", "CASHIER", "STOCK_CLERK"]);

function permissionsFor(role) {
  if (role === "OWNER") return { canSell: true, canManageStock: true, canManageStaff: true, canViewReports: true };
  if (role === "MANAGER") return { canSell: true, canManageStock: true, canManageStaff: true, canViewReports: true };
  if (role === "STOCK_CLERK") return { canSell: false, canManageStock: true, canManageStaff: false, canViewReports: false };
  return { canSell: true, canManageStock: false, canManageStaff: false, canViewReports: false };
}

function boolValue(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const staff = await prisma.staffMember.findMany({ where: { shopId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  res.json({ staff });
});

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const name = String(req.body.name || "").trim();
  const role = String(req.body.role || "CASHIER").toUpperCase();
  if (!name) return res.status(400).json({ error: "Staff name is required" });
  if (!ROLES.has(role)) return res.status(400).json({ error: "Invalid staff role" });

  const defaults = permissionsFor(role);
  const staff = await prisma.staffMember.create({
    data: {
      name,
      phone: String(req.body.phone || "").trim() || null,
      role,
      canSell: boolValue(req.body.canSell, defaults.canSell),
      canManageStock: boolValue(req.body.canManageStock, defaults.canManageStock),
      canManageStaff: boolValue(req.body.canManageStaff, defaults.canManageStaff),
      canViewReports: boolValue(req.body.canViewReports, defaults.canViewReports),
      shopId,
    },
  });

  req.audit = { action: "staff.create", resourceType: "staff", resourceId: staff.id };
  res.status(201).json({ staff });
});

const update = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await prisma.staffMember.findFirst({ where: { id: req.params.id, shopId } });
  if (!existing) return res.status(404).json({ error: "Staff member not found" });

  const role = String(req.body.role || existing.role).toUpperCase();
  if (!ROLES.has(role)) return res.status(400).json({ error: "Invalid staff role" });

  const staff = await prisma.staffMember.update({
    where: { id: existing.id },
    data: {
      name: req.body.name === undefined ? existing.name : String(req.body.name || "").trim(),
      phone: req.body.phone === undefined ? existing.phone : String(req.body.phone || "").trim() || null,
      role,
      canSell: boolValue(req.body.canSell, existing.canSell),
      canManageStock: boolValue(req.body.canManageStock, existing.canManageStock),
      canManageStaff: boolValue(req.body.canManageStaff, existing.canManageStaff),
      canViewReports: boolValue(req.body.canViewReports, existing.canViewReports),
      isActive: boolValue(req.body.isActive, existing.isActive),
    },
  });

  req.audit = { action: "staff.update", resourceType: "staff", resourceId: staff.id };
  res.json({ staff });
});

module.exports = { list, create, update };
