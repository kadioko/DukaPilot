const prisma = require("../lib/prisma");
const { getShopIdForUser } = require("../lib/shopAccess");
const { normalizeBarcode, nextInternalBarcode, nextInternalSku } = require("../lib/barcode");

function asyncHandler(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }
function canManageBarcode(req) { return req.user.role === "ADMIN" || !req.user.staffId || Boolean(req.user.permissions?.canManageStock); }

const generate = asyncHandler(async (req, res) => {
  if (!canManageBarcode(req)) return res.status(403).json({ error: "Only an admin or manager can generate barcodes" });
  const shopId = await getShopIdForUser(req.user);
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { barcodeGenerationEnabled: true } });
  if (!shop?.barcodeGenerationEnabled) return res.status(403).json({ error: "Barcode generation is disabled in settings" });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const barcode = await prisma.$transaction((tx) => nextInternalBarcode(tx, shopId));
    const exists = await prisma.product.findUnique({ where: { shopId_barcode: { shopId, barcode } }, select: { id: true } });
    if (!exists) return res.json({ barcode, barcodeType: "INTERNAL" });
  }
  return res.status(409).json({ error: "Could not reserve a barcode. Please try again." });
});

const generateSku = asyncHandler(async (req, res) => {
  if (!canManageBarcode(req)) return res.status(403).json({ error: "Only an admin, manager, or stock clerk can generate SKUs" });
  const shopId = await getShopIdForUser(req.user);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sku = await prisma.$transaction((tx) => nextInternalSku(tx, shopId));
    const exists = await prisma.product.findFirst({ where: { shopId, sku }, select: { id: true } });
    if (!exists) return res.json({ sku });
  }
  return res.status(409).json({ error: "Could not reserve an SKU. Please try again." });
});

const lookup = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const barcode = normalizeBarcode(req.params.barcode);
  if (!barcode) return res.status(400).json({ error: "Barcode is required" });
  const source = String(req.query.source || "MANUAL").toUpperCase();
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { barcodeScanningEnabled: true, bluetoothScannerEnabled: true, barcodeAutoAddToCart: true, barcodeSuccessSound: true, barcodeVibrate: true } });
  if (source !== "MANUAL" && shop?.barcodeScanningEnabled === false) return res.status(403).json({ error: "Barcode scanning is disabled in settings" });
  if (source === "HID" && shop?.bluetoothScannerEnabled === false) return res.status(403).json({ error: "Bluetooth and USB scanners are disabled in settings" });
  const product = await prisma.product.findFirst({ where: { shopId, barcode, isActive: true } });
  await prisma.barcodeScan.create({ data: { shopId, barcode, productId: product?.id || null, found: Boolean(product), context: String(req.query.context || "POS").slice(0, 30) } });
  if (!product) return res.status(404).json({ error: "This barcode was not found." });
  res.json({ product, behavior: { autoAddToCart: shop?.barcodeAutoAddToCart !== false, successSound: shop?.barcodeSuccessSound !== false, vibrate: shop?.barcodeVibrate !== false } });
});

const history = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const scans = await prisma.barcodeScan.findMany({ where: { shopId }, include: { product: { select: { id: true, name: true, barcode: true } } }, orderBy: { createdAt: "desc" }, take: Math.min(Number(req.query.limit) || 100, 200) });
  res.json({ scans });
});

const report = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const [withoutBarcodes, scannedGroups, duplicateAttempts] = await Promise.all([
    prisma.product.findMany({ where: { shopId, isActive: true, barcode: null }, select: { id: true, name: true, currentStock: true }, orderBy: { name: "asc" } }),
    prisma.barcodeScan.groupBy({ by: ["barcode"], where: { shopId, found: true }, _count: { barcode: true }, orderBy: { _count: { barcode: "desc" } }, take: 20 }),
    prisma.auditLog.count({ where: { action: "barcode.duplicate_attempt", metadata: { path: ["shopId"], equals: shopId } } }),
  ]);
  const products = await prisma.product.findMany({ where: { shopId, barcode: { in: scannedGroups.map((row) => row.barcode) } }, select: { id: true, name: true, barcode: true, sellingPrice: true } });
  const byBarcode = new Map(products.map((product) => [product.barcode, product]));
  const mostScanned = scannedGroups.map((row) => ({ barcode: row.barcode, scans: row._count.barcode, product: byBarcode.get(row.barcode) || null }));
  res.json({ withoutBarcodes, mostScanned, duplicateAttempts });
});

const settings = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const fields = ["barcodeScanningEnabled", "bluetoothScannerEnabled", "barcodeGenerationEnabled", "barcodeAutoFocus", "barcodeSuccessSound", "barcodeVibrate", "barcodeAutoAddToCart"];
  if (req.method === "GET") return res.json({ settings: await prisma.shop.findUnique({ where: { id: shopId }, select: Object.fromEntries(fields.map((key) => [key, true])) }) });
  if (!canManageBarcode(req)) return res.status(403).json({ error: "Only an admin or manager can change barcode settings" });
  const data = Object.fromEntries(fields.filter((key) => typeof req.body[key] === "boolean").map((key) => [key, req.body[key]]));
  res.json({ settings: await prisma.shop.update({ where: { id: shopId }, data, select: Object.fromEntries(fields.map((key) => [key, true])) }) });
});

module.exports = { generate, generateSku, lookup, history, report, settings, canManageBarcode };
