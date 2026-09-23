const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { VALID_DRIVERS, normalizeLabelTemplate, normalizePrinterProfile, visibleFields, renderPrinterOutput } = require("../services/labelPrint.service");

function asyncHandler(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }

function jsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function publicTemplate(template) {
  return template ? { ...template, fields: Array.isArray(template.fields) ? template.fields : [] } : null;
}

function publicProfile(profile) {
  return profile ? { ...profile, options: jsonObject(profile.options) } : null;
}

async function findTemplate(shopId, id) {
  if (!id) return null;
  return prisma.labelTemplate.findFirst({ where: { id, shopId } });
}

async function findProfile(shopId, id) {
  if (!id) return null;
  return prisma.printerProfile.findFirst({ where: { id, shopId } });
}

async function assertProfileTemplate(shopId, templateId) {
  if (templateId && !await findTemplate(shopId, templateId)) {
    throw Object.assign(new Error("Label template not found"), { status: 404 });
  }
}

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const [templates, profiles, jobs] = await Promise.all([
    prisma.labelTemplate.findMany({ where: { shopId }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] }),
    prisma.printerProfile.findMany({ where: { shopId }, include: { template: true }, orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }] }),
    prisma.labelPrintJob.findMany({ where: { shopId }, include: { template: { select: { id: true, name: true } }, printerProfile: { select: { id: true, name: true, driver: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  res.json({ templates: templates.map(publicTemplate), profiles: profiles.map(publicProfile), jobs });
});

const createTemplate = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const template = normalizeLabelTemplate(req.body);
  const existingCount = await prisma.labelTemplate.count({ where: { shopId } });
  const isDefault = Boolean(req.body.isDefault) || existingCount === 0;
  const created = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.labelTemplate.updateMany({ where: { shopId }, data: { isDefault: false } });
    return tx.labelTemplate.create({ data: { shopId, ...template, isDefault } });
  });
  req.audit = { action: "labels.template_created", resourceType: "label_template", resourceId: created.id, metadata: { shopId } };
  res.status(201).json({ template: publicTemplate(created) });
});

const updateTemplate = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await findTemplate(shopId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Label template not found" });
  const template = normalizeLabelTemplate({ ...existing, ...req.body });
  const isDefault = req.body.isDefault === undefined ? existing.isDefault : Boolean(req.body.isDefault);
  const updated = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.labelTemplate.updateMany({ where: { shopId, id: { not: existing.id } }, data: { isDefault: false } });
    return tx.labelTemplate.update({ where: { id: existing.id }, data: { ...template, isDefault } });
  });
  req.audit = { action: "labels.template_updated", resourceType: "label_template", resourceId: updated.id, metadata: { shopId } };
  res.json({ template: publicTemplate(updated) });
});

const removeTemplate = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await findTemplate(shopId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Label template not found" });
  await prisma.labelTemplate.delete({ where: { id: existing.id } });
  req.audit = { action: "labels.template_deleted", resourceType: "label_template", resourceId: existing.id, metadata: { shopId } };
  res.status(204).end();
});

const createProfile = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const profile = normalizePrinterProfile(req.body);
  if (!profile.name) return res.status(400).json({ error: "Printer profile name is required" });
  await assertProfileTemplate(shopId, req.body.templateId || null);
  const existingCount = await prisma.printerProfile.count({ where: { shopId } });
  const isDefault = Boolean(req.body.isDefault) || existingCount === 0;
  const created = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.printerProfile.updateMany({ where: { shopId }, data: { isDefault: false } });
    return tx.printerProfile.create({ data: { shopId, ...profile, templateId: req.body.templateId || null, isDefault, isActive: req.body.isActive !== false } });
  });
  req.audit = { action: "labels.printer_profile_created", resourceType: "printer_profile", resourceId: created.id, metadata: { shopId, driver: created.driver } };
  res.status(201).json({ profile: publicProfile(created) });
});

const updateProfile = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await findProfile(shopId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Printer profile not found" });
  const profile = normalizePrinterProfile({ ...existing, ...req.body });
  const templateId = req.body.templateId === undefined ? existing.templateId : req.body.templateId || null;
  await assertProfileTemplate(shopId, templateId);
  const isDefault = req.body.isDefault === undefined ? existing.isDefault : Boolean(req.body.isDefault);
  const updated = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.printerProfile.updateMany({ where: { shopId, id: { not: existing.id } }, data: { isDefault: false } });
    return tx.printerProfile.update({ where: { id: existing.id }, data: { ...profile, templateId, isDefault, isActive: req.body.isActive === undefined ? existing.isActive : Boolean(req.body.isActive) } });
  });
  req.audit = { action: "labels.printer_profile_updated", resourceType: "printer_profile", resourceId: updated.id, metadata: { shopId, driver: updated.driver } };
  res.json({ profile: publicProfile(updated) });
});

const removeProfile = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await findProfile(shopId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Printer profile not found" });
  await prisma.printerProfile.delete({ where: { id: existing.id } });
  req.audit = { action: "labels.printer_profile_deleted", resourceType: "printer_profile", resourceId: existing.id, metadata: { shopId } };
  res.status(204).end();
});

function expandItems(products, requested) {
  const byId = new Map(products.map((product) => [product.id, product]));
  const expanded = [];
  for (const entry of requested) {
    const product = byId.get(String(entry.productId || ""));
    const copies = Math.max(0, Math.min(100, Number.parseInt(entry.copies, 10) || 0));
    if (!product || copies === 0) continue;
    for (let copy = 0; copy < copies; copy += 1) expanded.push(product);
  }
  return expanded;
}

function snapshotProduct(product) {
  return {
    id: product.id,
    name: product.name,
    labelName: product.labelName,
    sku: product.sku,
    barcode: product.barcode,
    barcodeType: product.barcodeType,
    unit: product.unit,
    currentStock: product.currentStock,
    sellingPrice: product.sellingPrice,
  };
}

const prepareJob = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const requested = Array.isArray(req.body.items) ? req.body.items.slice(0, 200) : [];
  if (!requested.length) return res.status(400).json({ error: "Choose at least one product to print" });
  const ids = [...new Set(requested.map((item) => String(item?.productId || "")).filter(Boolean))];
  const products = await prisma.product.findMany({ where: { shopId, id: { in: ids }, isActive: true }, select: { id: true, name: true, labelName: true, sku: true, barcode: true, barcodeType: true, unit: true, currentStock: true, sellingPrice: true } });
  if (products.length !== ids.length) return res.status(404).json({ error: "One or more selected products are unavailable" });
  const expanded = expandItems(products, requested);
  if (!expanded.length || expanded.length > 500) return res.status(400).json({ error: "Choose between 1 and 500 labels" });

  const savedTemplate = req.body.templateId ? await findTemplate(shopId, req.body.templateId) : null;
  if (req.body.templateId && !savedTemplate) return res.status(404).json({ error: "Label template not found" });
  const defaultTemplate = !savedTemplate && !req.body.template ? await prisma.labelTemplate.findFirst({ where: { shopId, isDefault: true } }) : null;
  const template = normalizeLabelTemplate(savedTemplate || req.body.template || defaultTemplate || {});
  const requestedOutputDriver = req.body.outputDriver ? String(req.body.outputDriver).toUpperCase() : null;
  const savedProfile = req.body.printerProfileId
    ? await findProfile(shopId, req.body.printerProfileId)
    : requestedOutputDriver ? null : await prisma.printerProfile.findFirst({ where: { shopId, isDefault: true, isActive: true } });
  if (req.body.printerProfileId && !savedProfile) return res.status(404).json({ error: "Printer profile not found" });
  const profile = savedProfile ? normalizePrinterProfile(savedProfile) : normalizePrinterProfile({ driver: requestedOutputDriver || "BROWSER", widthMm: template.widthMm, heightMm: template.heightMm });
  const outputDriver = profile.driver;
  if (!VALID_DRIVERS.has(outputDriver)) return res.status(400).json({ error: "Unsupported printer driver" });
  if (visibleFields(template).includes("barcode") && expanded.some((product) => !product.barcode)) {
    return res.status(400).json({ error: "Every selected product needs a barcode for this label format" });
  }

  const snapshots = expanded.map(snapshotProduct);
  const output = renderPrinterOutput(outputDriver, snapshots, template, profile);
  const job = await prisma.labelPrintJob.create({
    data: {
      shopId,
      createdById: req.user.userId,
      templateId: savedTemplate?.id || null,
      printerProfileId: savedProfile?.id || null,
      outputDriver,
      items: snapshots,
      templateSnapshot: template,
      profileSnapshot: profile,
    },
    include: { template: { select: { id: true, name: true } }, printerProfile: { select: { id: true, name: true, driver: true } } },
  });
  req.audit = { action: "labels.job_prepared", resourceType: "label_print_job", resourceId: job.id, metadata: { shopId, count: snapshots.length, outputDriver } };
  res.status(201).json({ job, output: output ? { ...output, filename: `dukapilot-labels-${job.id}.${output.extension}` } : null });
});

const getOutput = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const job = await prisma.labelPrintJob.findFirst({ where: { id: req.params.id, shopId } });
  if (!job) return res.status(404).json({ error: "Label print job not found" });
  const output = renderPrinterOutput(job.outputDriver, Array.isArray(job.items) ? job.items : [], jsonObject(job.templateSnapshot), jsonObject(job.profileSnapshot));
  if (!output) return res.status(409).json({ error: "This browser or PDF job has no raw printer command" });
  res.json({ output: { ...output, filename: `dukapilot-labels-${job.id}.${output.extension}` } });
});

const completeJob = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const job = await prisma.labelPrintJob.findFirst({ where: { id: req.params.id, shopId }, select: { id: true } });
  if (!job) return res.status(404).json({ error: "Label print job not found" });
  const status = req.body.status === "FAILED" ? "FAILED" : "COMPLETED";
  const updated = await prisma.labelPrintJob.update({ where: { id: job.id }, data: { status, error: status === "FAILED" ? String(req.body.error || "Print failed").slice(0, 500) : null, completedAt: new Date() } });
  res.json({ job: updated });
});

module.exports = { list, createTemplate, updateTemplate, removeTemplate, createProfile, updateProfile, removeProfile, prepareJob, getOutput, completeJob };
