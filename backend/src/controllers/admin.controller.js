const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

const overview = asyncHandler(async (req, res) => {
  const [
    users,
    merchants,
    suppliers,
    admins,
    shops,
    products,
    sales,
    orders,
    debts,
    expenses,
    paidShops,
    auditLogs,
    recentPayments,
    onboardingRows,
    contactedShops,
    shopsWithNotes,
    recentlyContactedShops,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "MERCHANT" } }),
    prisma.user.count({ where: { role: "SUPPLIER" } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.shop.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.sale.count(),
    prisma.order.count(),
    prisma.debt.count(),
    prisma.expense.count(),
    prisma.shop.count({ where: { plan: { in: ["BASIC", "PRO"] }, isActive: true } }),
    prisma.auditLog.count(),
    prisma.subscriptionPayment.count({ where: { paidAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
    prisma.shop.groupBy({ by: ["onboardingStatus"], _count: { id: true } }),
    prisma.shop.count({ where: { lastContactedAt: { not: null } } }),
    prisma.shop.count({ where: { followUpNotes: { not: null } } }),
    prisma.shop.count({ where: { lastContactedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
  ]);
  const onboardingByStatus = Object.fromEntries(onboardingRows.map((row) => [row.onboardingStatus, row._count.id]));

  res.json({
    summary: { users, merchants, suppliers, admins, shops, products, sales, orders, debts, expenses, paidShops, auditLogs },
    launchAnalytics: {
      registrations: users,
      merchantShops: shops,
      firstProductProgress: products,
      firstSaleProgress: sales,
      firstDebtProgress: debts,
      expenseTrackingProgress: expenses,
      paidShops,
      paymentsConfirmed7d: recentPayments,
    },
    onboardingAnalytics: {
      totalShops: shops,
      new: onboardingByStatus.NEW || 0,
      contacted: onboardingByStatus.CONTACTED || 0,
      needsHelp: onboardingByStatus.NEEDS_HELP || 0,
      setupDone: onboardingByStatus.SETUP_DONE || 0,
      activated: onboardingByStatus.ACTIVATED || 0,
      paid: onboardingByStatus.PAID || 0,
      converted: onboardingByStatus.CONVERTED || 0,
      churnRisk: onboardingByStatus.CHURN_RISK || 0,
      contactedShops,
      shopsWithNotes,
      recentlyContactedShops,
      followUpCoverage: shops ? Math.round((contactedShops / shops) * 100) : 0,
      noteCoverage: shops ? Math.round((shopsWithNotes / shops) * 100) : 0,
    },
  });
});

const listUsers = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      phone: true,
      name: true,
      role: true,
      language: true,
      createdAt: true,
      shop: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  res.json({ users });
});

const listAuditLogs = asyncHandler(async (req, res) => {
  const { action, resourceType, userId, limit = 100 } = req.query;
  const where = {};
  if (action) where.action = String(action);
  if (resourceType) where.resourceType = String(resourceType);
  if (userId) where.userId = String(userId);

  const logs = await prisma.auditLog.findMany({
    where,
    include: {
      user: {
        select: { id: true, name: true, phone: true, role: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(limit) || 100, 500),
  });

  res.json({ logs });
});

const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (userId === req.user.userId) {
    return res.status(400).json({ error: "You cannot delete your own admin account" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phone: true,
      name: true,
      role: true,
      shop: { select: { id: true, name: true } },
      supplier: { select: { id: true, name: true } },
    },
  });
  if (!user) return res.status(404).json({ error: "User not found" });

  if (user.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return res.status(400).json({ error: "You cannot delete the last admin account" });
    }
  }

  await prisma.user.delete({ where: { id: userId } });

  req.audit = {
    action: "admin.user.delete",
    resourceType: "user",
    resourceId: userId,
    metadata: {
      adminId: req.user.userId,
      deletedUser: {
        phone: user.phone,
        role: user.role,
        shopId: user.shop?.id || null,
        supplierId: user.supplier?.id || null,
      },
    },
  };

  res.json({ message: "User removed", deletedUser: user });
});

// Admin: reset a user's PIN (requires new PIN in body)
const resetUserPin = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const newPin = String(req.body.newPin || "").trim();

  if (!/^\d{4,8}$/.test(newPin)) {
    return res.status(400).json({ error: "New PIN must be 4 to 8 digits" });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const hashedPin = await bcrypt.hash(newPin, 10);
  await prisma.user.update({ where: { id: userId }, data: { pin: hashedPin } });

  req.audit = {
    action: "admin.user.resetPin",
    resourceType: "user",
    resourceId: userId,
    metadata: { adminId: req.user.userId },
  };

  res.json({ message: "PIN reset successfully" });
});

const resetStaffPin = asyncHandler(async (req, res) => {
  const { staffId } = req.params;
  const newPin = String(req.body.newPin || "").trim();

  if (!/^\d{4,8}$/.test(newPin)) {
    return res.status(400).json({ error: "New PIN must be 4 to 8 digits" });
  }

  const staff = await prisma.staffMember.findUnique({ where: { id: staffId } });
  if (!staff) return res.status(404).json({ error: "Staff member not found" });

  const hashedPin = await bcrypt.hash(newPin, 10);
  await prisma.staffMember.update({ where: { id: staffId }, data: { pin: hashedPin } });

  req.audit = {
    action: "admin.staff.resetPin",
    resourceType: "staff",
    resourceId: staffId,
    metadata: { adminId: req.user.userId },
  };

  res.json({ message: "Staff PIN reset successfully" });
});

// Admin: find user by phone (for support lookup)
const findUserByPhone = asyncHandler(async (req, res) => {
  const phone = String(req.query.phone || "").replace(/[\s()-]/g, "").trim();
  if (!phone) return res.status(400).json({ error: "phone query parameter required" });

  const user = await prisma.user.findUnique({
    where: { phone },
    select: {
      id: true,
      phone: true,
      name: true,
      role: true,
      language: true,
      createdAt: true,
      shop: { select: { id: true, name: true, location: true, district: true, category: true } },
      supplier: { select: { id: true, name: true, phone: true } },
    },
  });

  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

const findStaffByPhone = asyncHandler(async (req, res) => {
  const phone = String(req.query.phone || "").replace(/[\s()-]/g, "").trim();
  if (!phone) return res.status(400).json({ error: "phone query parameter required" });

  const staff = await prisma.staffMember.findFirst({
    where: { phone },
    select: {
      id: true,
      phone: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      shop: { select: { id: true, name: true, user: { select: { name: true, phone: true } } } },
    },
  });

  if (!staff) return res.status(404).json({ error: "Staff member not found" });
  res.json({ staff });
});

module.exports = { overview, listUsers, listAuditLogs, deleteUser, resetUserPin, resetStaffPin, findUserByPhone, findStaffByPhone };
