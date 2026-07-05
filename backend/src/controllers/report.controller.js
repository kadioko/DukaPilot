const prisma = require("../lib/prisma");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Users can submit a report
const createReport = asyncHandler(async (req, res) => {
  const { type, title, description, priority } = req.body;
  const userId = req.user.userId;

  if (!title || !description) {
    return res.status(400).json({ error: "Title and description are required" });
  }

  const report = await prisma.report.create({
    data: {
      userId,
      type: type || "OTHER",
      title: String(title).trim(),
      description: String(description).trim(),
      priority: priority || "MEDIUM",
    },
    include: {
      user: { select: { id: true, name: true, phone: true, role: true, shop: { select: { id: true, name: true } } } },
    },
  });

  req.audit = {
    action: "report.created",
    resourceType: "report",
    resourceId: report.id,
  };

  res.status(201).json({ report });
});

// Users can view their own reports
const getMyReports = asyncHandler(async (req, res) => {
  const userId = req.user.userId;
  const { status, type, limit = 50 } = req.query;

  const where = { userId };
  if (status) where.status = String(status);
  if (type) where.type = String(type);

  const reports = await prisma.report.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(limit) || 50, 200),
    include: {
      user: { select: { id: true, name: true, phone: true, role: true, shop: { select: { id: true, name: true } } } },
    },
  });

  res.json({ reports });
});

// Admin: get all reports with filters
const getAllReports = asyncHandler(async (req, res) => {
  const { status, type, priority, userId, limit = 100 } = req.query;
  const where = {};
  if (status) where.status = String(status);
  if (type) where.type = String(type);
  if (priority) where.priority = String(priority);
  if (userId) where.userId = String(userId);

  const reports = await prisma.report.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(limit) || 100, 500),
    include: {
      user: { select: { id: true, name: true, phone: true, role: true, shop: { select: { id: true, name: true } } } },
    },
  });

  res.json({ reports });
});

// Admin: update report status, add admin notes, resolve
const updateReport = asyncHandler(async (req, res) => {
  const { reportId } = req.params;
  const { status, adminNotes, resolvedBy } = req.body;

  const updateData = {};
  if (status) {
    updateData.status = String(status);
    if (status === "RESOLVED") {
      updateData.resolvedAt = new Date();
      updateData.resolvedBy = resolvedBy || req.user.userId;
    }
  }
  if (adminNotes !== undefined) updateData.adminNotes = String(adminNotes);

  const report = await prisma.report.update({
    where: { id: reportId },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, phone: true, role: true, shop: { select: { id: true, name: true } } } },
    },
  });

  req.audit = {
    action: "admin.report.updated",
    resourceType: "report",
    resourceId: reportId,
    metadata: { status, adminNotes },
  };

  res.json({ report });
});

module.exports = { createReport, getMyReports, getAllReports, updateReport };
