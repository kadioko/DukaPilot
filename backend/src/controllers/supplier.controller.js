const prisma = require("../lib/prisma");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Merchant: manage their supplier relationships
const list = asyncHandler(async (req, res) => {
  const suppliers = await prisma.supplier.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      verificationStatus: true,
      verifiedAt: true,
      adminNotes: true,
      _count: { select: { products: true, orders: true } },
    },
    orderBy: { name: "asc" },
  });
  res.json({ suppliers });
});

const get = asyncHandler(async (req, res) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: req.params.id },
    include: {
      products: {
        where: { isActive: true },
        select: { id: true, name: true, unit: true, sellingPrice: true },
      },
    },
  });
  if (!supplier) return res.status(404).json({ error: "Supplier not found" });
  res.json({ supplier });
});

const create = asyncHandler(async (req, res) => {
  const { name, phone, address } = req.body;
  const supplier = await prisma.supplier.create({ data: { name, phone, address, verificationStatus: "NEEDS_REVIEW" } });
  res.status(201).json({ supplier });
});

const update = asyncHandler(async (req, res) => {
  const { name, phone, address, verificationStatus, adminNotes } = req.body;
  const adminVerificationPatch = {};
  if (req.user.role === "ADMIN") {
    const nextStatus = verificationStatus ? String(verificationStatus).toUpperCase() : undefined;
    if (nextStatus) {
      adminVerificationPatch.verificationStatus = nextStatus;
      adminVerificationPatch.verifiedAt = nextStatus === "VERIFIED" ? new Date() : null;
    }
    if (adminNotes !== undefined) adminVerificationPatch.adminNotes = String(adminNotes || "").trim() || null;
  }
  const supplier = await prisma.supplier.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(phone && { phone }),
      ...(address !== undefined && { address }),
      ...adminVerificationPatch,
    },
  });
  res.json({ supplier });
});

const remove = asyncHandler(async (req, res) => {
  const supplier = await prisma.supplier.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      name: true,
      phone: true,
      userId: true,
      _count: { select: { products: true, orders: true } },
    },
  });
  if (!supplier) return res.status(404).json({ error: "Supplier not found" });

  if (supplier._count.orders > 0) {
    return res.status(400).json({
      error: "This supplier has order history. Reject or archive the supplier instead of deleting it.",
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.updateMany({
      where: { supplierId: supplier.id },
      data: { supplierId: null },
    });
    await tx.supplier.delete({ where: { id: supplier.id } });
    if (supplier.userId) {
      await tx.user.delete({ where: { id: supplier.userId } });
    }
  });

  req.audit = {
    action: "admin.supplier.delete",
    resourceType: "supplier",
    resourceId: supplier.id,
    metadata: {
      adminId: req.user.userId,
      supplier: {
        name: supplier.name,
        phone: supplier.phone,
        productsDetached: supplier._count.products,
        linkedUserDeleted: Boolean(supplier.userId),
      },
    },
  };

  res.json({ message: "Supplier removed", deletedSupplier: supplier });
});

// Supplier portal: orders assigned to this supplier
const myOrders = asyncHandler(async (req, res) => {
  const supplierRecord = await prisma.supplier.findUnique({
    where: { userId: req.user.userId },
  });
  if (!supplierRecord) return res.status(404).json({ error: "Supplier profile not found" });

  const { status, limit = 100, offset = 0 } = req.query;
  const where = { supplierId: supplierRecord.id };
  if (status) where.status = status.toUpperCase();

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        shop: { select: { id: true, name: true, location: true, district: true } },
        items: {
          include: { product: { select: { id: true, name: true, unit: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(limit), 200),
      skip: Number(offset),
    }),
    prisma.order.count({ where }),
  ]);

  res.json({ orders, total, limit: Math.min(Number(limit), 200), offset: Number(offset) });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const supplierRecord = await prisma.supplier.findUnique({
    where: { userId: req.user.userId },
  });
  if (!supplierRecord) return res.status(404).json({ error: "Supplier profile not found" });

  const { status } = req.body;

  const order = await prisma.order.findFirst({
    where: { id: req.params.orderId, supplierId: supplierRecord.id },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });

  // Enforce forward-only transitions
  const transitions = { PENDING: ["CONFIRMED", "CANCELLED"], CONFIRMED: ["OUT_FOR_DELIVERY", "CANCELLED"] };
  const allowed = transitions[order.status] || [];
  if (!allowed.includes(status.toUpperCase())) {
    return res.status(400).json({ error: `Cannot move order from ${order.status} to ${status.toUpperCase()}` });
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status: status.toUpperCase() },
    include: {
      shop: { select: { id: true, name: true, location: true } },
      items: { include: { product: { select: { id: true, name: true, unit: true } } } },
    },
  });

  res.json({ order: updated });
});

// Supplier dashboard: sales/demand data for their customers
const supplierDashboard = asyncHandler(async (req, res) => {
  const supplierRecord = await prisma.supplier.findUnique({
    where: { userId: req.user.userId },
  });
  if (!supplierRecord) return res.status(404).json({ error: "Supplier profile not found" });

  const [orderStats, pendingOrders, topMerchants] = await Promise.all([
    prisma.order.groupBy({
      by: ["status"],
      where: { supplierId: supplierRecord.id },
      _count: { id: true },
    }),
    prisma.order.findMany({
      where: { supplierId: supplierRecord.id, status: "PENDING" },
      include: {
        shop: { select: { name: true, location: true, district: true } },
        items: { include: { product: { select: { name: true, unit: true } } } },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    prisma.order.groupBy({
      by: ["shopId"],
      where: { supplierId: supplierRecord.id, status: "DELIVERED" },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 5,
    }),
  ]);

  res.json({
    ordersByStatus: Object.fromEntries(orderStats.map((s) => [s.status, s._count.id])),
    pendingOrders,
    topMerchantIds: topMerchants.map((m) => m.shopId),
  });
});

module.exports = { list, get, create, update, remove, myOrders, updateOrderStatus, supplierDashboard };
