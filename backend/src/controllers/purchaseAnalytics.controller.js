const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { startOfTanzaniaWeek } = require("../lib/businessTime");

const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
const PAYMENT_METHODS = new Set(["CASH", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "HALOPESA", "BANK"]);
const PAGE_SIZE_MAX = 100;
const EXPORT_ROWS_MAX = 10000;

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function localDateStart(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return new Date(Date.UTC(year, month - 1, day) - TZ_OFFSET_MS);
}

function dateRange(period, fromInput, toInput, now = new Date()) {
  const shifted = new Date(now.getTime() + TZ_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth();
  const day = shifted.getUTCDate();
  const todayStart = new Date(Date.UTC(year, month, day) - TZ_OFFSET_MS);
  const end = new Date(now.getTime() + 1);

  if (period === "all") return { from: null, to: end };
  if (period === "today") return { from: todayStart, to: end };
  if (period === "week") return { from: startOfTanzaniaWeek(now), to: end };
  if (period === "month") return { from: new Date(Date.UTC(year, month, 1) - TZ_OFFSET_MS), to: end };
  if (period === "quarter") return { from: new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1) - TZ_OFFSET_MS), to: end };
  if (period === "year") return { from: new Date(Date.UTC(year, 0, 1) - TZ_OFFSET_MS), to: end };
  if (period !== "custom") return null;

  const from = localDateStart(fromInput);
  const toStart = localDateStart(toInput);
  if (!from || !toStart || from > toStart) return null;
  const to = new Date(toStart.getTime() + 24 * 60 * 60 * 1000);
  if (to.getTime() - from.getTime() > 3653 * 24 * 60 * 60 * 1000) return null;
  return { from, to };
}

function receiptWhere({ shopId, range, supplierId, paymentMethod, search }) {
  const where = { shopId };
  if (range.from || range.to) where.receivedAt = { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: range.to } : {}) };
  if (supplierId === "__unassigned__") where.supplierId = null;
  else if (supplierId) where.supplierId = supplierId;
  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: "insensitive" } },
      { note: { contains: search, mode: "insensitive" } },
      { supplier: { is: { name: { contains: search, mode: "insensitive" } } } },
      { items: { some: { product: { name: { contains: search, mode: "insensitive" } } } } },
    ];
  }
  return where;
}

function reportFilter(range, supplierId, paymentMethod, search) {
  const values = [];
  const clauses = ["sr.\"shopId\" = $1"];
  const bind = (value) => { values.push(value); return `$${values.length + 1}`; };
  if (range.from) clauses.push(`sr.\"receivedAt\" >= ${bind(range.from)}`);
  if (range.to) clauses.push(`sr.\"receivedAt\" < ${bind(range.to)}`);
  if (supplierId === "__unassigned__") clauses.push('sr.\"supplierId\" IS NULL');
  else if (supplierId) clauses.push(`sr.\"supplierId\" = ${bind(supplierId)}`);
  if (paymentMethod) clauses.push(`sr.\"paymentMethod\" = ${bind(paymentMethod)}::\"PaymentMethod\"`);
  if (search) {
    const term = bind(`%${search}%`);
    clauses.push(`(COALESCE(sr.\"invoiceNumber\", '') ILIKE ${term} OR COALESCE(sr.note, '') ILIKE ${term} OR COALESCE(sp.name, '') ILIKE ${term} OR EXISTS (SELECT 1 FROM stock_receipt_items search_item JOIN products search_product ON search_product.id = search_item.\"productId\" WHERE search_item.\"stockReceiptId\" = sr.id AND search_product.name ILIKE ${term}))`);
  }
  return { sql: clauses.join(" AND "), values };
}

const report = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const period = String(req.query.period || "month").toLowerCase();
  if (!["today", "week", "month", "quarter", "year", "all", "custom"].includes(period)) return res.status(400).json({ error: "Choose today, week, month, quarter, year, all, or custom" });
  if (period === "custom" && (!req.query.from || !req.query.to)) return res.status(400).json({ error: "Choose both start and end dates" });
  const range = dateRange(period, req.query.from, req.query.to);
  if (!range) return res.status(400).json({ error: "Choose a valid date range of up to ten years" });

  const supplierId = String(req.query.supplierId || "").trim();
  const paymentMethod = String(req.query.paymentMethod || "").trim().toUpperCase();
  const search = String(req.query.search || "").trim().slice(0, 120);
  if (paymentMethod && !PAYMENT_METHODS.has(paymentMethod)) return res.status(400).json({ error: "Choose a valid payment method" });

  const where = receiptWhere({ shopId, range, supplierId, paymentMethod, search });
  const page = Math.min(1_000_000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 25));
  const exportMode = req.query.export === "1";
  const offset = (page - 1) * pageSize;
  const filter = reportFilter(range, supplierId, paymentMethod, search);
  const optionsFilter = reportFilter(range, "", "", "");
  const queryParams = [shopId, ...filter.values];
  const supplierOptionParams = [shopId, ...optionsFilter.values];
  const summarySql = `SELECT COUNT(*)::int AS \"receiptCount\", COALESCE(SUM(sr.\"totalProductCost\"), 0)::bigint AS \"productCost\", COALESCE(SUM(sr.\"transportCost\"), 0)::bigint AS \"transportCost\", COALESCE(SUM(sr.\"otherCost\"), 0)::bigint AS \"otherCost\", COALESCE(SUM(sr.\"totalLandedCost\"), 0)::bigint AS \"landedCost\", COUNT(*) FILTER (WHERE sr.\"estimatedAllocation\")::int AS \"estimatedReceiptCount\" FROM stock_receipts sr LEFT JOIN suppliers sp ON sp.id = sr.\"supplierId\" WHERE ${filter.sql}`;

  const [summaryRows, paymentRows, supplierRows, supplierOptionRows, productRows, total, receipts] = await Promise.all([
    prisma.$queryRawUnsafe(summarySql, ...queryParams),
    prisma.$queryRawUnsafe(`SELECT sr.\"paymentMethod\" AS \"paymentMethod\", COUNT(*)::int AS \"receiptCount\", COALESCE(SUM(sr.\"totalLandedCost\"), 0)::bigint AS amount FROM stock_receipts sr LEFT JOIN suppliers sp ON sp.id = sr.\"supplierId\" WHERE ${filter.sql} GROUP BY sr.\"paymentMethod\" ORDER BY amount DESC`, ...queryParams),
    prisma.$queryRawUnsafe(`SELECT COALESCE(sr.\"supplierId\", '__unassigned__') AS id, COALESCE(MAX(sp.name), 'No supplier') AS name, COUNT(*)::int AS \"receiptCount\", COALESCE(SUM(sr.\"totalLandedCost\"), 0)::bigint AS amount FROM stock_receipts sr LEFT JOIN suppliers sp ON sp.id = sr.\"supplierId\" WHERE ${filter.sql} GROUP BY sr.\"supplierId\" ORDER BY amount DESC, name ASC LIMIT 100`, ...queryParams),
    prisma.$queryRawUnsafe(`SELECT COALESCE(sr.\"supplierId\", '__unassigned__') AS id, COALESCE(MAX(sp.name), 'No supplier') AS name, COUNT(*)::int AS \"receiptCount\" FROM stock_receipts sr LEFT JOIN suppliers sp ON sp.id = sr.\"supplierId\" WHERE ${optionsFilter.sql} GROUP BY sr.\"supplierId\" ORDER BY name ASC LIMIT 500`, ...supplierOptionParams),
    prisma.$queryRawUnsafe(`SELECT p.id, p.name, p.unit, COALESCE(SUM(sri.quantity), 0)::double precision AS quantity, COALESCE(SUM(sri.\"productCost\"), 0)::bigint AS \"productCost\", COALESCE(SUM(sri.\"allocatedAdditionalCost\"), 0)::bigint AS \"allocatedAdditionalCost\", COALESCE(SUM(sri.\"landedTotalCost\"), 0)::bigint AS \"landedCost\" FROM stock_receipt_items sri JOIN stock_receipts sr ON sr.id = sri.\"stockReceiptId\" JOIN products p ON p.id = sri.\"productId\" LEFT JOIN suppliers sp ON sp.id = sr.\"supplierId\" WHERE ${filter.sql} GROUP BY p.id, p.name, p.unit ORDER BY \"landedCost\" DESC, p.name ASC LIMIT 100`, ...queryParams),
    prisma.stockReceipt.count({ where }),
    exportMode
      ? prisma.stockReceipt.findMany({ where, orderBy: [{ receivedAt: "desc" }, { id: "desc" }], take: EXPORT_ROWS_MAX + 1, select: { id: true, receivedAt: true, invoiceNumber: true, paymentMethod: true, totalProductCost: true, transportCost: true, otherCost: true, totalLandedCost: true, estimatedAllocation: true, supplier: { select: { name: true } } } })
      : prisma.stockReceipt.findMany({ where, orderBy: [{ receivedAt: "desc" }, { id: "desc" }], skip: offset, take: pageSize, include: { supplier: { select: { id: true, name: true } }, items: { include: { product: { select: { id: true, name: true, unit: true } } } } } }),
  ]);

  if (exportMode && receipts.length > EXPORT_ROWS_MAX) return res.status(413).json({ error: "Too many receipts to export at once. Narrow the date range or filters and retry." });
  const summaryRow = summaryRows[0] || {};
  res.json({
    period,
    from: range.from,
    to: range.to,
    summary: {
      receiptCount: Number(summaryRow.receiptCount || 0),
      productCost: Number(summaryRow.productCost || 0),
      transportCost: Number(summaryRow.transportCost || 0),
      otherCost: Number(summaryRow.otherCost || 0),
      landedCost: Number(summaryRow.landedCost || 0),
      estimatedReceiptCount: Number(summaryRow.estimatedReceiptCount || 0),
    },
    paymentBreakdown: paymentRows.map((row) => ({ paymentMethod: row.paymentMethod, receiptCount: Number(row.receiptCount || 0), amount: Number(row.amount || 0) })),
    suppliers: supplierRows.map((row) => ({ id: row.id, name: row.name, receiptCount: Number(row.receiptCount || 0), amount: Number(row.amount || 0) })),
    supplierOptions: supplierOptionRows.map((row) => ({ id: row.id, name: row.name, receiptCount: Number(row.receiptCount || 0) })),
    products: productRows.map((row) => ({ id: row.id, name: row.name, unit: row.unit, quantity: Number(row.quantity || 0), productCost: Number(row.productCost || 0), allocatedAdditionalCost: Number(row.allocatedAdditionalCost || 0), landedCost: Number(row.landedCost || 0) })),
    receipts,
    pagination: exportMode ? null : { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
});

module.exports = { report, dateRange, receiptWhere, reportFilter };
