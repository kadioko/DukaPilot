const prisma = require("../lib/prisma");
const bcrypt = require("bcryptjs");

async function overview(req, res) {
  const [users, merchants, suppliers, admins, shops, products, sales, orders, auditLogs] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "MERCHANT" } }),
    prisma.user.count({ where: { role: "SUPPLIER" } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.shop.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.sale.count(),
    prisma.order.count(),
    prisma.auditLog.count(),
  ]);

  res.json({
    summary: { users, merchants, suppliers, admins, shops, products, sales, orders, auditLogs },
  });
}

async function listUsers(req, res) {
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
}

async function listAuditLogs(req, res) {
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
}

// Admin: reset a user's PIN (requires new PIN in body)
async function resetUserPin(req, res) {
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
}

// Admin: find user by phone (for support lookup)
async function findUserByPhone(req, res) {
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
}

module.exports = { overview, listUsers, listAuditLogs, resetUserPin, findUserByPhone };
