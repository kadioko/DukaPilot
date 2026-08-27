const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { normalizePhone } = require("../lib/phone");
const { findOpenCashSession } = require("../lib/cashSession");

const STATUSES = new Set(["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED", "CONVERTED", "ARCHIVED", "CANCELLED"]);
const CATEGORIES = new Set(["MATERIAL", "LABOUR", "TRANSPORT", "DESIGN", "INSTALLATION", "SUBCONTRACTOR", "SERVICE", "OTHER"]);
const PAYMENT_METHODS = new Set(["CASH", "MPESA", "TIGOPESA", "AIRTEL_MONEY", "HALOPESA", "BANK"]);
const SHARE_METHODS = new Set(["PDF", "PRINT", "LINK", "WHATSAPP", "EMAIL"]);
const PAYMENT_STAGES = new Set(["DEPOSIT", "MILESTONE", "FINAL", "OTHER"]);
const MAX_TEXT = 10_000;

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function actorId(req) {
  return req.user.staffId || req.user.userId;
}

function canViewCosts(req) {
  return req.user.role === "ADMIN" || !req.user.staffId || Boolean(req.user.permissions?.canViewQuotationCosts || req.user.permissions?.canViewReports);
}

function cleanText(value, max = MAX_TEXT) {
  if (value === undefined || value === null) return null;
  // Documents are rendered as text, not HTML. This removes markup before it
  // reaches a PDF, public link, or future rich-text renderer.
  return String(value).replace(/<[^>]*>/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max) || null;
}

function wholeTzs(value, fallback = 0, field = "amount") {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw Object.assign(new Error(`${field} must be a whole TZS amount of 0 or more`), { status: 400 });
  return number;
}

function positiveTzs(value, field = "amount") {
  const number = wholeTzs(value, 0, field);
  if (number <= 0) throw Object.assign(new Error(`${field} must be a whole positive TZS amount`), { status: 400 });
  return number;
}

function quantityMilli(value) {
  const raw = String(value === undefined || value === null || value === "" ? "1" : value).trim();
  if (!/^\d+(?:\.\d{1,3})?$/.test(raw)) throw Object.assign(new Error("Quantity must be a positive number with up to three decimal places"), { status: 400 });
  const [whole, decimal = ""] = raw.split(".");
  const result = (Number(whole) * 1000) + Number((decimal + "000").slice(0, 3));
  if (!Number.isSafeInteger(result) || result <= 0) throw Object.assign(new Error("Quantity must be greater than zero"), { status: 400 });
  return result;
}

function divideRounded(numerator, denominator) {
  const a = BigInt(numerator);
  const b = BigInt(denominator);
  return Number((a + (b / 2n)) / b);
}

function basisPoints(value, fallback = 0, field = "tax rate") {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100_000) throw Object.assign(new Error(`${field} must be between 0 and 100000 basis points`), { status: 400 });
  return number;
}

function displayQuantity(milli) {
  const value = Number(milli || 0) / 1000;
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function statusLabel(status) {
  return String(status || "DRAFT").toUpperCase();
}

function documentLanguage(value, fallback = "sw") {
  const language = String(value === undefined || value === null || value === "" ? fallback : value).trim().toLowerCase();
  if (!["sw", "en"].includes(language)) throw Object.assign(new Error("Document language must be Swahili or English"), { status: 400 });
  return language;
}

function idempotencyKey(req) {
  const key = cleanText(req.get?.("Idempotency-Key") || req.body.idempotencyKey, 120);
  if (key && !/^[A-Za-z0-9._:-]{8,120}$/.test(key)) throw Object.assign(new Error("Idempotency key is invalid"), { status: 400 });
  return key;
}

function publicItem(item, settings) {
  const row = {
    category: item.category,
    name: item.name,
    description: item.description || null,
    unit: item.unit,
    lineTotal: item.totalSellingPrice,
  };
  if (settings.showQuantities) row.quantity = displayQuantity(item.quantityMilli);
  if (settings.showUnitPrices) row.unitPrice = item.unitPrice;
  if (settings.showItemDiscounts && item.discountAmount > 0) row.discountAmount = item.discountAmount;
  if (item.taxAmount > 0) row.taxAmount = item.taxAmount;
  return row;
}

function quotationSnapshot(quotation, settings) {
  const sections = (quotation.sections || []).map((section) => ({
    id: section.id,
    name: section.name,
    position: section.position,
    visibleToCustomer: section.visibleToCustomer,
  }));
  const items = (quotation.items || []).map((item) => ({
    id: item.id,
    sectionId: item.sectionId,
    position: item.position,
    category: item.category,
    name: item.name,
    description: item.description || null,
    quantityMilli: item.quantityMilli,
    unit: item.unit,
    unitPrice: item.unitPrice,
    discountAmount: item.discountAmount,
    taxRateBasisPoints: item.taxRateBasisPoints,
    lineSubtotal: item.lineSubtotal,
    taxAmount: item.taxAmount,
    totalSellingPrice: item.totalSellingPrice,
    visibleToCustomer: item.visibleToCustomer,
    productId: item.productId || null,
    estimatedUnitCost: item.estimatedUnitCost,
    estimatedTotalCost: item.estimatedTotalCost,
    supplierId: item.supplierId || null,
    supplierName: item.supplier?.name || null,
    internalNote: item.internalNote || null,
    markupBasisPoints: item.markupBasisPoints,
    estimatedProfit: item.estimatedProfit,
    estimatedProfitMarginBps: item.estimatedProfitMarginBps,
  }));
  const base = {
    quotationNumber: quotation.quotationNumber,
    revisionNumber: quotation.currentRevisionNumber,
    status: quotation.status,
    issueDate: quotation.issueDate,
    expiryDate: quotation.expiryDate,
    projectTitle: quotation.projectTitle,
    projectType: quotation.projectType || null,
    scopeOfWork: quotation.scopeOfWork || null,
    currency: quotation.currency,
    documentLanguage: documentLanguage(quotation.documentLanguage, settings.defaultDocumentLanguage),
    customer: quotation.customer ? {
      name: quotation.customer.name,
      phone: quotation.customer.phone || null,
      email: quotation.customer.email || null,
      address: quotation.customer.address || null,
    } : null,
    customerNote: quotation.customerNote || null,
    internalNote: quotation.internalNote || null,
    termsAndConditions: quotation.termsAndConditions || null,
    paymentTerms: quotation.paymentTerms || null,
    discountAmount: quotation.discountAmount,
    taxRateBasisPoints: quotation.taxRateBasisPoints,
    subtotalAmount: quotation.subtotalAmount,
    taxAmount: quotation.taxAmount,
    totalAmount: quotation.totalAmount,
    amountPaid: quotation.amountPaid,
    outstandingAmount: Math.max(0, quotation.totalAmount - quotation.amountPaid),
    depositRequiredAmount: quotation.depositRequiredAmount,
    depositDueDate: quotation.depositDueDate,
    acceptedAt: quotation.acceptedAt || null,
    acceptedByName: quotation.acceptedByName || null,
    rejectionReason: quotation.rejectionReason || null,
    sections,
    items,
  };
  const publicSections = settings.showSections ? sections.filter((section) => section.visibleToCustomer) : [];
  return {
    snapshot: base,
    publicSnapshot: {
      quotationNumber: base.quotationNumber,
      revisionNumber: base.revisionNumber,
      status: base.status,
      issueDate: base.issueDate,
      expiryDate: base.expiryDate,
      projectTitle: base.projectTitle,
      projectType: base.projectType,
      scopeOfWork: base.scopeOfWork,
      currency: base.currency,
      documentLanguage: base.documentLanguage,
      business: settings.business,
      customer: base.customer,
      customerNote: base.customerNote,
      termsAndConditions: base.termsAndConditions,
      paymentTerms: base.paymentTerms,
      discountAmount: base.discountAmount,
      taxAmount: base.taxAmount,
      subtotalAmount: base.subtotalAmount,
      totalAmount: base.totalAmount,
      outstandingAmount: base.outstandingAmount,
      depositRequiredAmount: base.depositRequiredAmount,
      depositDueDate: base.depositDueDate,
      acceptedAt: base.acceptedAt,
      acceptedByName: base.acceptedByName,
      sections: publicSections,
      items: (quotation.items || []).filter((item) => item.visibleToCustomer && (!item.sectionId || !settings.showSections || publicSections.some((section) => section.id === item.sectionId))).map((item) => ({ ...publicItem(item, settings), sectionId: settings.showSections ? item.sectionId : null, position: item.position })),
      signatureName: settings.signatureName || null,
    },
  };
}

async function quotationSettings(tx, shopId) {
  const settings = await tx.quotationSettings.upsert({
    where: { shopId },
    create: { shopId },
    update: {},
  });
  const shop = await tx.shop.findUnique({ where: { id: shopId }, select: { name: true, location: true, district: true, user: { select: { phone: true } } } });
  return { ...settings, business: { name: shop.name, location: shop.location, district: shop.district, phone: shop.user?.phone || null } };
}

function formatQuotationNumber(settings, sequence) {
  const prefix = cleanText(settings.prefix, 20) || "QT";
  const format = cleanText(settings.numberingFormat, 80) || "{prefix}-{number}";
  const padded = String(sequence).padStart(4, "0");
  const result = format.replaceAll("{prefix}", prefix).replaceAll("{number}", padded).replaceAll("{year}", String(new Date().getFullYear()));
  if (!/^[A-Za-z0-9._/-]{1,80}$/.test(result)) throw Object.assign(new Error("Quotation numbering format creates an invalid number"), { status: 400 });
  return result;
}

function normalizeCustomer(input) {
  const name = cleanText(input?.name, 160);
  if (!name) throw Object.assign(new Error("Customer name is required"), { status: 400 });
  const phone = input?.phone ? normalizePhone(input.phone) : null;
  const email = cleanText(input?.email, 160)?.toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error("Customer email is not valid"), { status: 400 });
  return { name, phone, email, address: cleanText(input?.address, 500), notes: cleanText(input?.notes, 2000) };
}

async function resolveCustomer(tx, shopId, input, existingId = null) {
  if (existingId) {
    const customer = await tx.customer.findFirst({ where: { id: existingId, shopId } });
    if (!customer) throw Object.assign(new Error("Customer not found in this business"), { status: 404 });
    if (!input) return customer;
    const next = normalizeCustomer(input);
    return tx.customer.update({ where: { id: customer.id }, data: next });
  }
  const next = normalizeCustomer(input);
  const duplicate = next.phone
    ? await tx.customer.findFirst({ where: { shopId, phone: next.phone } })
    : next.email ? await tx.customer.findFirst({ where: { shopId, email: next.email } }) : null;
  if (duplicate) return tx.customer.update({ where: { id: duplicate.id }, data: { ...next, notes: next.notes || duplicate.notes } });
  return tx.customer.create({ data: { ...next, shopId } });
}

async function buildLines(tx, shopId, rawItems, rawSections, defaults) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) throw Object.assign(new Error("Add at least one quotation item"), { status: 400 });
  if (rawItems.length > 250) throw Object.assign(new Error("A quotation can have up to 250 items"), { status: 400 });
  const sections = Array.isArray(rawSections) ? rawSections.slice(0, 30).map((section, index) => ({
    key: String(section.key ?? index),
    name: cleanText(section.name, 120),
    position: index,
    visibleToCustomer: section.visibleToCustomer !== false,
  })).filter((section) => section.name) : [];
  const productIds = [...new Set(rawItems.map((item) => item.productId).filter(Boolean).map(String))];
  const serviceIds = [...new Set(rawItems.map((item) => item.serviceId).filter(Boolean).map(String))];
  const supplierIds = [...new Set(rawItems.map((item) => item.supplierId).filter(Boolean).map(String))];
  const [products, services, suppliers] = await Promise.all([
    productIds.length ? tx.product.findMany({ where: { id: { in: productIds }, shopId, isActive: true } }) : [],
    serviceIds.length ? tx.service.findMany({ where: { id: { in: serviceIds }, shopId, isActive: true } }) : [],
    supplierIds.length ? tx.supplier.findMany({ where: { id: { in: supplierIds }, OR: [{ createdByShopId: shopId }, { createdByShopId: null }] } }) : [],
  ]);
  if (products.length !== productIds.length) throw Object.assign(new Error("One or more linked products do not belong to this business"), { status: 400 });
  if (services.length !== serviceIds.length) throw Object.assign(new Error("One or more saved services do not belong to this business"), { status: 400 });
  if (suppliers.length !== supplierIds.length) throw Object.assign(new Error("One or more suppliers do not belong to this business"), { status: 400 });
  const productMap = new Map(products.map((product) => [product.id, product]));
  const serviceMap = new Map(services.map((service) => [service.id, service]));
  const supplierMap = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
  const lines = rawItems.map((raw, index) => {
    const product = raw.productId ? productMap.get(String(raw.productId)) : null;
    const service = raw.serviceId ? serviceMap.get(String(raw.serviceId)) : null;
    const category = String(raw.category || (product ? "MATERIAL" : "SERVICE")).toUpperCase();
    if (!CATEGORIES.has(category)) throw Object.assign(new Error(`Invalid item category on line ${index + 1}`), { status: 400 });
    const quantity = quantityMilli(raw.quantity);
    const unitPrice = wholeTzs(raw.unitPrice, product?.sellingPrice ?? service?.defaultSellingPrice ?? 0, `Selling price on line ${index + 1}`);
    const unitCost = wholeTzs(raw.estimatedUnitCost, product?.buyingPrice ?? service?.defaultEstimatedUnitCost ?? 0, `Estimated cost on line ${index + 1}`);
    const gross = divideRounded(BigInt(unitPrice) * BigInt(quantity), 1000n);
    const discount = Math.min(wholeTzs(raw.discountAmount, 0, `Discount on line ${index + 1}`), gross);
    const lineSubtotal = gross - discount;
    const totalCost = divideRounded(BigInt(unitCost) * BigInt(quantity), 1000n);
    const estimatedProfit = lineSubtotal - totalCost;
    const sectionKey = raw.sectionKey === undefined || raw.sectionKey === null || raw.sectionKey === "" ? null : String(raw.sectionKey);
    if (sectionKey && !sections.some((section) => section.key === sectionKey)) throw Object.assign(new Error(`Line ${index + 1} refers to an unknown section`), { status: 400 });
    const taxRateBasisPoints = basisPoints(raw.taxRateBasisPoints, defaults.defaultTaxRateBasisPoints, `Tax rate on line ${index + 1}`);
    const name = cleanText(raw.name, 240) || product?.name || service?.name;
    if (!name) throw Object.assign(new Error(`Item name is required on line ${index + 1}`), { status: 400 });
    const unit = cleanText(raw.unit, 30) || product?.unit || service?.unit || "pcs";
    const supplier = raw.supplierId ? supplierMap.get(String(raw.supplierId)) : null;
    return {
      sectionKey,
      position: index,
      category,
      name,
      description: cleanText(raw.description, 2000),
      quantityMilli: quantity,
      unit,
      unitPrice,
      discountAmount: discount,
      taxRateBasisPoints,
      lineSubtotal,
      taxAmount: 0,
      totalSellingPrice: 0,
      visibleToCustomer: raw.visibleToCustomer !== false,
      productId: product?.id || null,
      serviceId: service?.id || null,
      estimatedUnitCost: unitCost,
      estimatedTotalCost: totalCost,
      supplierId: supplier?.id || null,
      internalNote: cleanText(raw.internalNote, 2000),
      markupBasisPoints: totalCost > 0 ? divideRounded(BigInt(estimatedProfit) * 10000n, BigInt(totalCost)) : 0,
      estimatedProfit,
      estimatedProfitMarginBps: lineSubtotal > 0 ? divideRounded(BigInt(estimatedProfit) * 10000n, BigInt(lineSubtotal)) : 0,
    };
  });
  return { sections, lines };
}

function calculateTotals(lines, quotationDiscount) {
  const subtotal = lines.reduce((sum, line) => sum + line.lineSubtotal, 0);
  const discount = Math.min(quotationDiscount, subtotal);
  let allocated = 0;
  const withTax = lines.map((line, index) => {
    const allocation = index === lines.length - 1
      ? discount - allocated
      : subtotal > 0 ? Math.min(line.lineSubtotal, divideRounded(BigInt(discount) * BigInt(line.lineSubtotal), BigInt(subtotal))) : 0;
    allocated += allocation;
    const taxable = Math.max(0, line.lineSubtotal - allocation);
    const taxAmount = divideRounded(BigInt(taxable) * BigInt(line.taxRateBasisPoints), 10000n);
    return { ...line, taxAmount, totalSellingPrice: taxable + taxAmount };
  });
  const taxAmount = withTax.reduce((sum, line) => sum + line.taxAmount, 0);
  return { lines: withTax, subtotalAmount: subtotal, discountAmount: discount, taxAmount, totalAmount: subtotal - discount + taxAmount };
}

function hasDiscount(body) {
  return Number(body?.discountAmount || 0) > 0 || (Array.isArray(body?.items) && body.items.some((item) => Number(item?.discountAmount || 0) > 0));
}

function assertDiscountPermission(req) {
  if (hasDiscount(req.body) && req.user?.staffId && !req.user?.permissions?.canApproveQuotationDiscounts) {
    throw Object.assign(new Error("You do not have permission to approve quotation discounts"), { status: 403 });
  }
}

async function fetchQuotation(tx, id, shopId) {
  const quotation = await tx.quotation.findFirst({
    where: { id, shopId },
    include: {
      customer: true,
      sections: { orderBy: { position: "asc" } },
      items: { include: { product: { select: { id: true, name: true, unit: true, currentStock: true } }, supplier: { select: { id: true, name: true } } }, orderBy: { position: "asc" } },
      payments: { orderBy: { paidAt: "desc" } },
      convertedSale: { select: { id: true, receiptNumber: true, totalAmount: true } },
    },
  });
  if (!quotation) throw Object.assign(new Error("Quotation not found"), { status: 404 });
  return quotation;
}

async function writeRevision(tx, quotation, settings, changedById, changeSummary = null) {
  const snapshot = quotationSnapshot(quotation, settings);
  await tx.quotationRevision.upsert({
    where: { quotationId_revisionNumber: { quotationId: quotation.id, revisionNumber: quotation.currentRevisionNumber } },
    create: { quotationId: quotation.id, revisionNumber: quotation.currentRevisionNumber, snapshot: snapshot.snapshot, publicSnapshot: snapshot.publicSnapshot, changedById, changeSummary },
    update: { snapshot: snapshot.snapshot, publicSnapshot: snapshot.publicSnapshot, changedById, changeSummary },
  });
  return snapshot;
}

function redactQuotation(quotation, req) {
  if (canViewCosts(req)) return quotation;
  const safe = JSON.parse(JSON.stringify(quotation));
  delete safe.internalNote;
  safe.items = (safe.items || []).map((item) => {
    delete item.estimatedUnitCost;
    delete item.estimatedTotalCost;
    delete item.supplierId;
    delete item.supplier;
    delete item.internalNote;
    delete item.markupBasisPoints;
    delete item.estimatedProfit;
    delete item.estimatedProfitMarginBps;
    return item;
  });
  return safe;
}

async function expireQuotes(shopId) {
  await prisma.quotation.updateMany({
    where: { shopId, status: "SENT", expiryDate: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
}

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  await expireQuotes(shopId);
  const status = String(req.query.status || "").toUpperCase();
  const where = { shopId };
  if (STATUSES.has(status)) where.status = status;
  if (req.query.customerId) where.customerId = String(req.query.customerId);
  if (req.query.staffId) where.createdById = String(req.query.staffId);
  if (req.query.projectType) where.projectType = { contains: String(req.query.projectType), mode: "insensitive" };
  if (req.query.from || req.query.to) {
    where.issueDate = {};
    if (req.query.from) where.issueDate.gte = new Date(`${req.query.from}T00:00:00.000Z`);
    if (req.query.to) where.issueDate.lte = new Date(`${req.query.to}T23:59:59.999Z`);
  }
  const [quotations, total] = await Promise.all([
    prisma.quotation.findMany({
      where,
      include: { customer: { select: { id: true, name: true, phone: true, email: true } }, _count: { select: { items: true, revisions: true } }, convertedSale: { select: { id: true, receiptNumber: true } } },
      orderBy: { updatedAt: "desc" },
      take: Math.min(Math.max(Number(req.query.limit) || 50, 1), 200),
      skip: Math.max(Number(req.query.offset) || 0, 0),
    }),
    prisma.quotation.count({ where }),
  ]);
  res.json({ quotations, total });
});

const get = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  await expireQuotes(shopId);
  const quotation = await fetchQuotation(prisma, req.params.id, shopId);
  res.json({ quotation: redactQuotation(quotation, req) });
});

const customers = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const search = cleanText(req.query.search, 160);
  const where = { shopId };
  if (search) where.OR = [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }, { email: { contains: search, mode: "insensitive" } }];
  const results = await prisma.customer.findMany({ where, orderBy: { updatedAt: "desc" }, take: 30 });
  res.json({ customers: results });
});

const services = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const search = cleanText(req.query.search, 160);
  const where = { shopId, isActive: true };
  if (search) where.name = { contains: search, mode: "insensitive" };
  res.json({ services: await prisma.service.findMany({ where, orderBy: { name: "asc" }, take: 100 }) });
});

const createService = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const name = cleanText(req.body.name, 240);
  if (!name) return res.status(400).json({ error: "Service name is required" });
  const service = await prisma.service.create({ data: {
    name,
    description: cleanText(req.body.description, 2000),
    unit: cleanText(req.body.unit, 30) || "service",
    defaultSellingPrice: wholeTzs(req.body.defaultSellingPrice, 0, "Default selling price"),
    defaultEstimatedUnitCost: wholeTzs(req.body.defaultEstimatedUnitCost, 0, "Default estimated cost"),
    shopId,
  } });
  req.audit = { action: "quotation.service.create", resourceType: "service", resourceId: service.id };
  res.status(201).json({ service });
});

const getSettings = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const settings = await quotationSettings(prisma, shopId);
  res.json({ settings });
});

const updateSettings = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const allowed = ["prefix", "numberingFormat", "defaultValidityDays", "defaultCurrency", "defaultDocumentLanguage", "defaultTaxRateBasisPoints", "defaultPaymentTerms", "defaultTerms", "defaultCustomerNote", "signatureName", "signatureUrl", "showQuantities", "showUnitPrices", "showItemDiscounts", "showSections", "defaultDepositPercent"];
  const data = {};
  for (const key of allowed) {
    if (req.body[key] === undefined) continue;
    if (["defaultValidityDays", "defaultTaxRateBasisPoints", "defaultDepositPercent"].includes(key)) data[key] = wholeTzs(req.body[key], 0, key);
    else if (key === "defaultDocumentLanguage") data[key] = documentLanguage(req.body[key]);
    else if (["showQuantities", "showUnitPrices", "showItemDiscounts", "showSections"].includes(key)) data[key] = Boolean(req.body[key]);
    else {
      const text = cleanText(req.body[key], key === "numberingFormat" ? 80 : 500);
      if (text !== null || !["prefix", "numberingFormat", "defaultCurrency"].includes(key)) data[key] = text;
    }
  }
  if (data.defaultDepositPercent !== undefined && data.defaultDepositPercent > 100) return res.status(400).json({ error: "Default deposit percentage cannot exceed 100" });
  if (data.defaultCurrency && !/^[A-Z]{3}$/.test(data.defaultCurrency.toUpperCase())) return res.status(400).json({ error: "Currency must use a 3-letter code" });
  const settings = await prisma.quotationSettings.upsert({ where: { shopId }, create: { shopId, ...data }, update: data });
  req.audit = { action: "quotation.settings.update", resourceType: "quotationSettings", resourceId: settings.id, metadata: Object.keys(data) };
  res.json({ settings });
});

function inputHeader(body, settings) {
  const validity = wholeTzs(body.validityDays, settings.defaultValidityDays, "Validity period");
  const issueDate = body.issueDate ? new Date(`${body.issueDate}T12:00:00.000Z`) : new Date();
  if (Number.isNaN(issueDate.getTime())) throw Object.assign(new Error("Issue date is invalid"), { status: 400 });
  const expiryDate = body.expiryDate === "" ? null : body.expiryDate ? new Date(`${body.expiryDate}T23:59:59.999Z`) : validity ? new Date(issueDate.getTime() + validity * 86400000) : null;
  if (expiryDate && Number.isNaN(expiryDate.getTime())) throw Object.assign(new Error("Expiry date is invalid"), { status: 400 });
  if (expiryDate && expiryDate < issueDate) throw Object.assign(new Error("Expiry date must be after issue date"), { status: 400 });
  const title = cleanText(body.projectTitle, 240);
  if (!title) throw Object.assign(new Error("Project or quotation title is required"), { status: 400 });
  const currency = String(body.currency || settings.defaultCurrency || "TZS").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw Object.assign(new Error("Currency must use a 3-letter code"), { status: 400 });
  const depositPercent = body.depositPercent === undefined ? settings.defaultDepositPercent : wholeTzs(body.depositPercent, 0, "Deposit percentage");
  if (depositPercent > 100) throw Object.assign(new Error("Deposit percentage cannot exceed 100"), { status: 400 });
  return {
    issueDate,
    expiryDate,
    projectTitle: title,
    projectType: cleanText(body.projectType, 120),
    scopeOfWork: cleanText(body.scopeOfWork, 10_000),
    currency,
    documentLanguage: documentLanguage(body.documentLanguage, settings.defaultDocumentLanguage),
    customerNote: cleanText(body.customerNote === undefined ? settings.defaultCustomerNote : body.customerNote, 10_000),
    internalNote: cleanText(body.internalNote, 10_000),
    termsAndConditions: cleanText(body.termsAndConditions === undefined ? settings.defaultTerms : body.termsAndConditions, 10_000),
    paymentTerms: cleanText(body.paymentTerms === undefined ? settings.defaultPaymentTerms : body.paymentTerms, 5000),
    taxRateBasisPoints: basisPoints(body.taxRateBasisPoints, settings.defaultTaxRateBasisPoints),
    depositPercent,
    depositDueDate: body.depositDueDate ? new Date(`${body.depositDueDate}T23:59:59.999Z`) : null,
  };
}

async function replaceItemsAndSections(tx, quotationId, sections, lines) {
  await tx.quotationItem.deleteMany({ where: { quotationId } });
  await tx.quotationSection.deleteMany({ where: { quotationId } });
  const createdSections = [];
  for (const section of sections) {
    createdSections.push({ ...section, record: await tx.quotationSection.create({ data: { quotationId, name: section.name, position: section.position, visibleToCustomer: section.visibleToCustomer } }) });
  }
  const sectionIdByKey = new Map(createdSections.map((section) => [section.key, section.record.id]));
  if (lines.length) await tx.quotationItem.createMany({ data: lines.map((line) => ({ ...line, sectionKey: undefined, quotationId, sectionId: line.sectionKey ? sectionIdByKey.get(line.sectionKey) || null : null })) });
}

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  assertDiscountPermission(req);
  const created = await prisma.$transaction(async (tx) => {
    const settings = await quotationSettings(tx, shopId);
    const header = inputHeader(req.body, settings);
    const customer = await resolveCustomer(tx, shopId, req.body.customer, req.body.customerId ? String(req.body.customerId) : null);
    const { sections, lines } = await buildLines(tx, shopId, req.body.items, req.body.sections, { ...settings, defaultTaxRateBasisPoints: header.taxRateBasisPoints });
    const totals = calculateTotals(lines, wholeTzs(req.body.discountAmount, 0, "Quotation discount"));
    const counter = await tx.shop.update({ where: { id: shopId }, data: { nextQuotationNumber: { increment: 1 } }, select: { nextQuotationNumber: true } });
    const quotationNumber = formatQuotationNumber(settings, counter.nextQuotationNumber - 1);
    const quotation = await tx.quotation.create({
      data: {
        quotationNumber,
        status: "DRAFT",
        ...header,
        discountAmount: totals.discountAmount,
        subtotalAmount: totals.subtotalAmount,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        depositRequiredAmount: divideRounded(BigInt(totals.totalAmount) * BigInt(header.depositPercent), 100n),
        customerId: customer.id,
        shopId,
        createdById: actorId(req),
        lastEditedById: actorId(req),
      },
    });
    await replaceItemsAndSections(tx, quotation.id, sections, totals.lines);
    const full = await fetchQuotation(tx, quotation.id, shopId);
    await writeRevision(tx, full, settings, actorId(req), "Created draft");
    return full;
  });
  req.audit = { action: "quotation.create", resourceType: "quotation", resourceId: created.id, metadata: { quotationNumber: created.quotationNumber } };
  res.status(201).json({ quotation: redactQuotation(created, req) });
});

const update = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  assertDiscountPermission(req);
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await fetchQuotation(tx, req.params.id, shopId);
    if (["CONVERTED", "ARCHIVED", "CANCELLED"].includes(existing.status)) throw Object.assign(new Error("This quotation can no longer be edited"), { status: 409 });
    if (existing.status !== "DRAFT" && req.user?.staffId && !req.user?.permissions?.canEditSentQuotations) {
      throw Object.assign(new Error("You do not have permission to revise a sent quotation"), { status: 403 });
    }
    const settings = await quotationSettings(tx, shopId);
    const needsRevision = existing.status !== "DRAFT";
    const header = inputHeader(req.body, settings);
    const customer = await resolveCustomer(tx, shopId, req.body.customer, req.body.customerId ? String(req.body.customerId) : existing.customerId);
    const { sections, lines } = await buildLines(tx, shopId, req.body.items, req.body.sections, { ...settings, defaultTaxRateBasisPoints: header.taxRateBasisPoints });
    const totals = calculateTotals(lines, wholeTzs(req.body.discountAmount, 0, "Quotation discount"));
    if (totals.totalAmount < existing.amountPaid) throw Object.assign(new Error(`The amended total cannot be below the ${existing.amountPaid} TZS already collected. Record a refund first, or keep the total at least that amount.`), { status: 409 });
    const revisionNumber = needsRevision ? existing.currentRevisionNumber + 1 : existing.currentRevisionNumber;
    await tx.quotation.update({
      where: { id: existing.id },
      data: {
        ...header,
        customerId: customer.id,
        currentRevisionNumber: revisionNumber,
        status: needsRevision ? "DRAFT" : existing.status,
        sentAt: needsRevision ? null : existing.sentAt,
        acceptedAt: needsRevision ? null : existing.acceptedAt,
        acceptedByName: needsRevision ? null : existing.acceptedByName,
        acceptanceComment: needsRevision ? null : existing.acceptanceComment,
        acceptanceSignature: needsRevision ? null : existing.acceptanceSignature,
        rejectedAt: needsRevision ? null : existing.rejectedAt,
        rejectionReason: needsRevision ? null : existing.rejectionReason,
        discountAmount: totals.discountAmount,
        subtotalAmount: totals.subtotalAmount,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        depositRequiredAmount: divideRounded(BigInt(totals.totalAmount) * BigInt(header.depositPercent), 100n),
        lastEditedById: actorId(req),
      },
    });
    await replaceItemsAndSections(tx, existing.id, sections, totals.lines);
    const full = await fetchQuotation(tx, existing.id, shopId);
    await writeRevision(tx, full, settings, actorId(req), cleanText(req.body.changeSummary, 1000) || (needsRevision ? "New revision requires sending again" : "Draft updated"));
    return full;
  });
  req.audit = { action: "quotation.update", resourceType: "quotation", resourceId: updated.id, metadata: { revision: updated.currentRevisionNumber, status: updated.status } };
  res.json({ quotation: redactQuotation(updated, req) });
});

const duplicate = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const source = await fetchQuotation(prisma, req.params.id, shopId);
  req.body = {
    customerId: source.customerId,
    projectTitle: `${source.projectTitle} (copy)`,
    projectType: source.projectType,
    scopeOfWork: source.scopeOfWork,
    currency: source.currency,
    documentLanguage: source.documentLanguage,
    customerNote: source.customerNote,
    internalNote: source.internalNote,
    termsAndConditions: source.termsAndConditions,
    paymentTerms: source.paymentTerms,
    discountAmount: source.discountAmount,
    taxRateBasisPoints: source.taxRateBasisPoints,
    depositDueDate: source.depositDueDate?.toISOString().slice(0, 10),
    sections: source.sections.map((section, index) => ({ key: String(index), name: section.name, visibleToCustomer: section.visibleToCustomer })),
    items: source.items.map((item) => ({ ...item, sectionKey: item.sectionId ? String(source.sections.findIndex((section) => section.id === item.sectionId)) : null, quantity: displayQuantity(item.quantityMilli) })),
  };
  return create(req, res);
});

const revisions = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  await fetchQuotation(prisma, req.params.id, shopId);
  const revisions = await prisma.quotationRevision.findMany({ where: { quotationId: req.params.id }, orderBy: { revisionNumber: "desc" } });
  if (!canViewCosts(req)) {
    return res.json({ revisions: revisions.map((revision) => ({ ...revision, snapshot: undefined })) });
  }
  res.json({ revisions });
});

const restoreRevision = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const revision = await prisma.quotationRevision.findFirst({ where: { quotationId: req.params.id, revisionNumber: Number(req.params.revisionNumber), quotation: { shopId } } });
  if (!revision) return res.status(404).json({ error: "Quotation revision not found" });
  const snapshot = revision.snapshot;
  req.body = {
    customer: snapshot.customer,
    projectTitle: snapshot.projectTitle,
    projectType: snapshot.projectType,
    scopeOfWork: snapshot.scopeOfWork,
    currency: snapshot.currency,
    customerNote: snapshot.customerNote,
    internalNote: snapshot.internalNote,
    termsAndConditions: snapshot.termsAndConditions,
    paymentTerms: snapshot.paymentTerms,
    discountAmount: snapshot.discountAmount,
    taxRateBasisPoints: snapshot.taxRateBasisPoints,
    issueDate: snapshot.issueDate ? new Date(snapshot.issueDate).toISOString().slice(0, 10) : undefined,
    expiryDate: snapshot.expiryDate ? new Date(snapshot.expiryDate).toISOString().slice(0, 10) : "",
    sections: (snapshot.sections || []).map((section) => ({ key: section.id, name: section.name, visibleToCustomer: section.visibleToCustomer })),
    items: (snapshot.items || []).map((item) => ({ ...item, quantity: displayQuantity(item.quantityMilli), sectionKey: item.sectionId })),
    changeSummary: `Restored revision ${revision.revisionNumber}`,
  };
  return update(req, res);
});

const send = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const result = await prisma.$transaction(async (tx) => {
    const quotation = await fetchQuotation(tx, req.params.id, shopId);
    if (!["DRAFT", "SENT", "EXPIRED"].includes(quotation.status)) throw Object.assign(new Error("Only a draft, sent, or expired quotation can be sent"), { status: 409 });
    if (quotation.expiryDate && quotation.expiryDate < new Date()) throw Object.assign(new Error("Update the expiry date before sending this quotation"), { status: 400 });
    const updated = await tx.quotation.update({ where: { id: quotation.id }, data: { status: "SENT", sentAt: new Date(), lastEditedById: actorId(req) } });
    const full = await fetchQuotation(tx, updated.id, shopId);
    const settings = await quotationSettings(tx, shopId);
    await writeRevision(tx, full, settings, actorId(req), "Sent to customer");
    const method = SHARE_METHODS.has(String(req.body.method || "LINK").toUpperCase()) ? String(req.body.method || "LINK").toUpperCase() : "LINK";
    const share = await tx.quotationShare.create({ data: { quotationId: full.id, revisionNumber: full.currentRevisionNumber, token: crypto.randomBytes(32).toString("base64url"), method, sentTo: cleanText(req.body.sentTo, 160), createdById: actorId(req) } });
    return { quotation: full, share };
  });
  req.audit = { action: "quotation.send", resourceType: "quotation", resourceId: result.quotation.id, metadata: { method: result.share.method, revision: result.share.revisionNumber } };
  res.json({ quotation: redactQuotation(result.quotation, req), share: { token: result.share.token, revisionNumber: result.share.revisionNumber, method: result.share.method } });
});

const markShared = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const quotation = await fetchQuotation(prisma, req.params.id, shopId);
  if (quotation.status !== "SENT") return res.status(409).json({ error: "Send the quotation before recording a share" });
  const method = String(req.body.method || "LINK").toUpperCase();
  if (!SHARE_METHODS.has(method)) return res.status(400).json({ error: "Invalid share method" });
  const share = await prisma.quotationShare.create({ data: { quotationId: quotation.id, revisionNumber: quotation.currentRevisionNumber, token: crypto.randomBytes(32).toString("base64url"), method, sentTo: cleanText(req.body.sentTo, 160), createdById: actorId(req) } });
  req.audit = { action: "quotation.share", resourceType: "quotation", resourceId: quotation.id, metadata: { method } };
  res.status(201).json({ share: { token: share.token, revisionNumber: share.revisionNumber, method: share.method } });
});

const accept = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const quotation = await prisma.quotation.findFirst({ where: { id: req.params.id, shopId } });
  if (!quotation) return res.status(404).json({ error: "Quotation not found" });
  if (quotation.status !== "SENT") return res.status(409).json({ error: "Only a sent quotation can be accepted" });
  const acceptedByName = cleanText(req.body.acceptedByName, 160);
  if (!acceptedByName) return res.status(400).json({ error: "Accepting person's name is required" });
  const updated = await prisma.quotation.update({ where: { id: quotation.id }, data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByName, acceptanceComment: cleanText(req.body.comment, 2000), acceptanceSignature: cleanText(req.body.signature, 5000), lastEditedById: actorId(req) } });
  req.audit = { action: "quotation.accept", resourceType: "quotation", resourceId: updated.id, metadata: { acceptedByName } };
  res.json({ quotation: updated });
});

const reject = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const quotation = await prisma.quotation.findFirst({ where: { id: req.params.id, shopId } });
  if (!quotation) return res.status(404).json({ error: "Quotation not found" });
  if (!["SENT", "EXPIRED"].includes(quotation.status)) return res.status(409).json({ error: "Only a sent quotation can be rejected" });
  const updated = await prisma.quotation.update({ where: { id: quotation.id }, data: { status: "REJECTED", rejectedAt: new Date(), rejectionReason: cleanText(req.body.reason, 2000), lastEditedById: actorId(req) } });
  req.audit = { action: "quotation.reject", resourceType: "quotation", resourceId: updated.id };
  res.json({ quotation: updated });
});

const archive = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const quotation = await prisma.quotation.findFirst({ where: { id: req.params.id, shopId } });
  if (!quotation) return res.status(404).json({ error: "Quotation not found" });
  const updated = await prisma.quotation.update({ where: { id: quotation.id }, data: { status: "ARCHIVED", archivedAt: new Date(), lastEditedById: actorId(req) } });
  req.audit = { action: "quotation.archive", resourceType: "quotation", resourceId: updated.id };
  res.json({ quotation: updated });
});

const cancel = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const quotation = await prisma.quotation.findFirst({ where: { id: req.params.id, shopId } });
  if (!quotation) return res.status(404).json({ error: "Quotation not found" });
  if (quotation.status === "CONVERTED") return res.status(409).json({ error: "A converted quotation cannot be cancelled" });
  const updated = await prisma.quotation.update({ where: { id: quotation.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancellationReason: cleanText(req.body.reason, 2000), lastEditedById: actorId(req) } });
  req.audit = { action: "quotation.cancel", resourceType: "quotation", resourceId: updated.id };
  res.json({ quotation: updated });
});

const removeDraft = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const result = await prisma.quotation.deleteMany({ where: { id: req.params.id, shopId, status: "DRAFT", shares: { none: {} }, payments: { none: {} } } });
  if (!result.count) return res.status(409).json({ error: "Only an unshared draft without payments can be deleted" });
  req.audit = { action: "quotation.delete_draft", resourceType: "quotation", resourceId: req.params.id };
  res.json({ message: "Draft quotation deleted" });
});

const recordPayment = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const amount = positiveTzs(req.body.amount, "Payment amount");
  const method = String(req.body.paymentMethod || "CASH").toUpperCase();
  const stage = String(req.body.stage || "OTHER").toUpperCase();
  const requestKey = idempotencyKey(req);
  if (!PAYMENT_METHODS.has(method) || !PAYMENT_STAGES.has(stage)) return res.status(400).json({ error: "Invalid payment method or payment stage" });
  const paymentRef = cleanText(req.body.paymentRef, 160);
  const note = cleanText(req.body.note, 2000);
  let result;
  try { result = await prisma.$transaction(async (tx) => {
    const quotation = await fetchQuotation(tx, req.params.id, shopId);
    if (requestKey && quotation.payments.some((payment) => payment.idempotencyKey === requestKey)) return { quote: quotation, reused: true };
    if (!["SENT", "ACCEPTED", "CONVERTED"].includes(quotation.status)) throw Object.assign(new Error("Payments can be recorded after a quotation is sent"), { status: 409 });
    const outstanding = quotation.totalAmount - quotation.amountPaid;
    if (amount > outstanding) throw Object.assign(new Error(`Payment exceeds the outstanding balance of ${outstanding} TZS`), { status: 400 });
    const cashSession = method === "CASH" ? await findOpenCashSession(tx, shopId, req.user) : null;
    const payment = await tx.quotationPayment.create({ data: { quotationId: quotation.id, amount, kind: "PAYMENT", stage, paymentMethod: method, paymentRef, idempotencyKey: requestKey, note, recordedById: actorId(req), cashSessionId: cashSession?.id || null } });
    if (quotation.convertedSale) {
      const debt = await tx.debt.findFirst({ where: { saleId: quotation.convertedSale.id, shopId } });
      if (debt) {
        const paid = debt.amountPaid + amount;
        const guarded = await tx.debt.updateMany({ where: { id: debt.id, amountPaid: debt.amountPaid }, data: { amountPaid: paid, status: paid >= debt.amount ? "PAID" : "PARTIAL" } });
        if (guarded.count !== 1) throw Object.assign(new Error("Payment changed before it could be saved. Refresh and try again."), { status: 409 });
        const debtPayment = await tx.debtPayment.create({ data: { debtId: debt.id, amount, paymentMethod: method, paymentRef, note, recordedBy: actorId(req), cashSessionId: cashSession?.id || null } });
        await tx.quotationPayment.update({ where: { id: payment.id }, data: { debtPaymentId: debtPayment.id } });
      }
    }
    const guarded = await tx.quotation.updateMany({ where: { id: quotation.id, amountPaid: quotation.amountPaid }, data: { amountPaid: { increment: amount }, lastEditedById: actorId(req) } });
    if (guarded.count !== 1) throw Object.assign(new Error("Payment changed before it could be saved. Refresh and try again."), { status: 409 });
    return { quote: await fetchQuotation(tx, quotation.id, shopId), reused: false };
  }); } catch (error) {
    if (error.code !== "P2002" || !requestKey) throw error;
    const quote = await fetchQuotation(prisma, req.params.id, shopId);
    if (!quote.payments.some((payment) => payment.idempotencyKey === requestKey)) throw error;
    result = { quote, reused: true };
  }
  req.audit = { action: result.reused ? "quotation.payment.reused" : "quotation.payment.record", resourceType: "quotation", resourceId: result.quote.id, metadata: { amount, method, stage, idempotencyKey: requestKey } };
  res.status(result.reused ? 200 : 201).json({ quotation: redactQuotation(result.quote, req), reused: result.reused });
});

const refundPayment = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const amount = positiveTzs(req.body.amount, "Refund amount");
  const method = String(req.body.paymentMethod || "CASH").toUpperCase();
  const stage = String(req.body.stage || "OTHER").toUpperCase();
  const requestKey = idempotencyKey(req);
  if (!PAYMENT_METHODS.has(method) || !PAYMENT_STAGES.has(stage)) return res.status(400).json({ error: "Invalid payment method or payment stage" });
  const paymentRef = cleanText(req.body.paymentRef, 160);
  const note = cleanText(req.body.note, 2000);
  let result;
  try { result = await prisma.$transaction(async (tx) => {
    const quotation = await fetchQuotation(tx, req.params.id, shopId);
    if (requestKey && quotation.payments.some((payment) => payment.idempotencyKey === requestKey)) return { quote: quotation, reused: true };
    if (quotation.status === "CONVERTED") throw Object.assign(new Error("This quotation is already a sale. Use the sale void/refund process so revenue, stock, and receivables stay correct."), { status: 409 });
    if (amount > quotation.amountPaid) throw Object.assign(new Error(`Refund exceeds the ${quotation.amountPaid} TZS currently collected on this quotation`), { status: 400 });
    const cashSession = method === "CASH" ? await findOpenCashSession(tx, shopId, req.user) : null;
    await tx.quotationPayment.create({ data: { quotationId: quotation.id, amount, kind: "REFUND", stage, paymentMethod: method, paymentRef, idempotencyKey: requestKey, note, recordedById: actorId(req), cashSessionId: cashSession?.id || null } });
    const guarded = await tx.quotation.updateMany({ where: { id: quotation.id, amountPaid: { gte: amount } }, data: { amountPaid: { decrement: amount }, lastEditedById: actorId(req) } });
    if (guarded.count !== 1) throw Object.assign(new Error("Payment changed before the refund could be saved. Refresh and try again."), { status: 409 });
    return { quote: await fetchQuotation(tx, quotation.id, shopId), reused: false };
  }); } catch (error) {
    if (error.code !== "P2002" || !requestKey) throw error;
    const quote = await fetchQuotation(prisma, req.params.id, shopId);
    if (!quote.payments.some((payment) => payment.idempotencyKey === requestKey)) throw error;
    result = { quote, reused: true };
  }
  req.audit = { action: result.reused ? "quotation.refund.reused" : "quotation.refund.record", resourceType: "quotation", resourceId: result.quote.id, metadata: { amount, method, stage, idempotencyKey: requestKey } };
  res.status(result.reused ? 200 : 201).json({ quotation: redactQuotation(result.quote, req), reused: result.reused });
});

const convert = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const result = await prisma.$transaction(async (tx) => {
    const quotation = await fetchQuotation(tx, req.params.id, shopId);
    if (quotation.status === "CONVERTED" || quotation.convertedSale) throw Object.assign(new Error("This quotation has already been converted"), { status: 409 });
    if (quotation.status !== "ACCEPTED") throw Object.assign(new Error("Accept the quotation before converting it to a sale"), { status: 409 });
    const outstanding = quotation.totalAmount - quotation.amountPaid;
    if (outstanding > 0 && !quotation.customer.phone) throw Object.assign(new Error("Customer phone is required before an unpaid quotation can become a sale"), { status: 400 });
    const linkedItems = quotation.items.filter((item) => item.productId);
    for (const item of linkedItems) {
      if (item.quantityMilli % 1000 !== 0) throw Object.assign(new Error(`${item.name} uses a fractional inventory quantity. Adjust it to a whole stock unit before conversion.`), { status: 400 });
      const product = item.product;
      const quantity = item.quantityMilli / 1000;
      if (!product || product.currentStock < quantity) throw Object.assign(new Error(`Insufficient stock for ${item.name}`), { status: 400 });
    }
    const counter = await tx.shop.update({ where: { id: shopId }, data: { nextSaleNumber: { increment: 1 } }, select: { nextSaleNumber: true } });
    const receiptNumber = counter.nextSaleNumber - 1;
    const fullPaymentMethod = PAYMENT_METHODS.has(String(req.body.paymentMethod || "").toUpperCase()) ? String(req.body.paymentMethod).toUpperCase() : (quotation.payments[0]?.paymentMethod || "CASH");
    const paymentMethod = outstanding > 0 ? "CREDIT" : fullPaymentMethod;
    const cashSession = paymentMethod === "CASH" ? await findOpenCashSession(tx, shopId, req.user) : null;
    const sale = await tx.sale.create({
      data: {
        totalAmount: quotation.totalAmount,
        profit: quotation.items.reduce((sum, item) => sum + item.estimatedProfit, 0),
        paymentMethod,
        paymentRef: cleanText(req.body.paymentRef, 160),
        customerPhone: quotation.customer.phone,
        customerName: quotation.customer.name,
        customerId: quotation.customer.id,
        quotationId: quotation.id,
        note: `Converted from quotation ${quotation.quotationNumber}`,
        receiptNumber,
        cashSessionId: cashSession?.id || null,
        shopId,
        items: {
          create: quotation.items.map((item) => ({
            quantity: item.productId ? item.quantityMilli / 1000 : 1,
            unitPrice: item.productId ? item.unitPrice : item.totalSellingPrice,
            buyingPrice: item.productId ? item.estimatedUnitCost : item.estimatedTotalCost,
            totalPrice: item.totalSellingPrice,
            productId: item.productId,
            name: item.name,
            description: item.description,
            unit: item.unit,
            quotedQuantityMilli: item.quantityMilli,
          })),
        },
      },
      include: { items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
    });
    for (const item of linkedItems) {
      const quantity = item.quantityMilli / 1000;
      const updated = await tx.product.updateMany({ where: { id: item.productId, shopId, isActive: true, currentStock: { gte: quantity } }, data: { currentStock: { decrement: quantity } } });
      if (updated.count !== 1) throw Object.assign(new Error(`Stock changed before ${item.name} could be converted`), { status: 409 });
      await tx.stockMovement.create({ data: { type: "OUT", quantity, note: `Quotation ${quotation.quotationNumber} converted to receipt #${String(receiptNumber).padStart(6, "0")}`, productId: item.productId } });
    }
    if (outstanding > 0) {
      const debt = await tx.debt.create({ data: { customerName: quotation.customer.name, customerPhone: quotation.customer.phone, amount: quotation.totalAmount, amountPaid: quotation.amountPaid, status: quotation.amountPaid > 0 ? "PARTIAL" : "OPEN", dueDate: quotation.depositDueDate, note: `Quotation ${quotation.quotationNumber}`, saleId: sale.id, shopId } });
      for (const payment of quotation.payments) {
        const debtPayment = await tx.debtPayment.create({ data: { debtId: debt.id, amount: payment.kind === "REFUND" ? -payment.amount : payment.amount, paymentMethod: payment.paymentMethod, paymentRef: payment.paymentRef, note: `Quotation ${payment.kind === "REFUND" ? "refund" : "payment"}: ${payment.note || payment.stage}`, recordedBy: payment.recordedById, cashSessionId: payment.cashSessionId || null } });
        await tx.quotationPayment.update({ where: { id: payment.id }, data: { debtPaymentId: debtPayment.id } });
      }
    }
    const guarded = await tx.quotation.updateMany({ where: { id: quotation.id, shopId, status: "ACCEPTED" }, data: { status: "CONVERTED", lastEditedById: actorId(req) } });
    if (guarded.count !== 1) throw Object.assign(new Error("Quotation changed before it could be converted. Refresh and try again."), { status: 409 });
    return { sale, quotation: await fetchQuotation(tx, quotation.id, shopId) };
  });
  req.audit = { action: "quotation.convert", resourceType: "quotation", resourceId: result.quotation.id, metadata: { saleId: result.sale.id, receiptNumber: result.sale.receiptNumber } };
  res.status(201).json({ sale: result.sale, quotation: redactQuotation(result.quotation, req) });
});

const metrics = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  await expireQuotes(shopId);
  const where = { shopId };
  if (req.query.from || req.query.to) {
    where.issueDate = {};
    if (req.query.from) where.issueDate.gte = new Date(`${req.query.from}T00:00:00.000Z`);
    if (req.query.to) where.issueDate.lte = new Date(`${req.query.to}T23:59:59.999Z`);
  }
  const quotations = await prisma.quotation.findMany({ where, select: { status: true, totalAmount: true, amountPaid: true, subtotalAmount: true, taxAmount: true, items: { select: { estimatedTotalCost: true, estimatedProfit: true } } } });
  const byStatus = Object.fromEntries([...STATUSES].map((status) => [status, { count: 0, value: 0 }]));
  let totalValue = 0; let outstanding = 0; let estimatedCost = 0; let estimatedProfit = 0;
  for (const quotation of quotations) {
    byStatus[quotation.status].count += 1;
    byStatus[quotation.status].value += quotation.totalAmount;
    totalValue += quotation.totalAmount;
    outstanding += quotation.totalAmount - quotation.amountPaid;
    for (const item of quotation.items) { estimatedCost += item.estimatedTotalCost; estimatedProfit += item.estimatedProfit; }
  }
  const sentOrDecided = byStatus.SENT.count + byStatus.ACCEPTED.count + byStatus.CONVERTED.count + byStatus.REJECTED.count + byStatus.EXPIRED.count;
  const acceptedOrConverted = byStatus.ACCEPTED.count + byStatus.CONVERTED.count;
  const pipelineValue = byStatus.DRAFT.value + byStatus.SENT.value;
  const acceptedWorkValue = byStatus.ACCEPTED.value;
  const convertedSalesValue = byStatus.CONVERTED.value;
  const receivables = quotations.filter((quotation) => quotation.status === "CONVERTED").reduce((sum, quotation) => sum + Math.max(0, quotation.totalAmount - quotation.amountPaid), 0);
  const collectedCash = quotations.reduce((sum, quotation) => sum + quotation.amountPaid, 0);
  const response = { totalValue, byStatus, conversionRate: sentOrDecided ? Number(((acceptedOrConverted / sentOrDecided) * 100).toFixed(1)) : 0, averageQuotationValue: quotations.length ? Math.round(totalValue / quotations.length) : 0, outstandingBalance: outstanding, quotationCount: quotations.length, pipeline: { value: pipelineValue, count: byStatus.DRAFT.count + byStatus.SENT.count }, acceptedWork: { value: acceptedWorkValue, count: byStatus.ACCEPTED.count }, convertedSales: { value: convertedSalesValue, count: byStatus.CONVERTED.count }, collectedCash, receivables };
  if (canViewCosts(req)) Object.assign(response, { estimatedCost, estimatedProfit, estimatedMargin: totalValue ? Number(((estimatedProfit / totalValue) * 100).toFixed(1)) : 0 });
  res.json({ metrics: response });
});

module.exports = { list, get, customers, services, createService, getSettings, updateSettings, create, update, duplicate, revisions, restoreRevision, send, markShared, accept, reject, archive, cancel, removeDraft, recordPayment, refundPayment, convert, metrics, quotationSnapshot, fetchQuotation, redactQuotation };
