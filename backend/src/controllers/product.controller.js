const prisma = require("../lib/prisma");
const { parse } = require("csv-parse/sync");
const { getShopIdForUser } = require("../lib/shopAccess");
const { inferBarcodeType, validateBarcode, nextInternalBarcode } = require("../lib/barcode");
const { getRequestLanguage } = require("../lib/requestLanguage");

const PRODUCT_IMPORT_MAX_ROWS = 200;
const PRODUCT_IMPORT_MAX_BYTES = 500_000;
const PRODUCT_IMPORT_COLUMNS = {
  name: "name",
  sku: "sku",
  unit: "unit",
  buyingprice: "buyingPrice",
  sellingprice: "sellingPrice",
  currentstock: "currentStock",
  minimumstock: "minimumStock",
  barcode: "barcode",
  expirydate: "expiryDate",
  doesnotexpire: "doesNotExpire",
};

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch((error) => {
    if (error?.code === "P2002" && Array.isArray(error?.meta?.target) && error.meta.target.includes("barcode")) {
      req.audit = { action: "barcode.duplicate_attempt", resourceType: "product", metadata: { shopId: req.user?.shopId || null } };
      return res.status(409).json({ error: "This barcode is already used by another product." });
    }
    return next(error);
  });
}

function canViewFinancials(req) {
  return req.user.role === "ADMIN" || !req.user.staffId || req.user.permissions?.canViewReports;
}

function canGenerateBarcode(req) {
  return req.user.role === "ADMIN" || !req.user.staffId || req.user.staffRole === "MANAGER";
}

function redactProduct(product, req) {
  return canViewFinancials(req) ? product : { ...product, buyingPrice: null };
}

function normalizeImportHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseImportInteger(value, { row, field, fallback, minimum = 0, required = false, errors }) {
  if (value === undefined || value === null || String(value).trim() === "") {
    if (required) errors.push({ row, field, message: `${field} is required` });
    return fallback;
  }
  const parsed = Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed < minimum) {
    errors.push({ row, field, message: `${field} must be a whole number${minimum > 0 ? ` of at least ${minimum}` : " of 0 or more"}` });
    return fallback;
  }
  return parsed;
}

function parseImportDate(value, row, errors) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    errors.push({ row, field: "expiryDate", message: "expiryDate must use YYYY-MM-DD" });
    return null;
  }
  const date = new Date(`${text}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    errors.push({ row, field: "expiryDate", message: "expiryDate is not a real calendar date" });
    return null;
  }
  return date;
}

function parseImportBoolean(value, row, errors) {
  if (value === undefined || value === null || String(value).trim() === "") return false;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes", "1", "ndio"].includes(normalized)) return true;
  if (["false", "no", "0", "hapana"].includes(normalized)) return false;
  errors.push({ row, field: "doesNotExpire", message: "doesNotExpire must be true or false" });
  return false;
}

function parseProductImport(csv) {
  if (typeof csv !== "string" || !csv.trim()) {
    return { errors: [{ row: 1, field: "file", message: "Choose a CSV file with a header row" }], products: [] };
  }
  if (Buffer.byteLength(csv, "utf8") > PRODUCT_IMPORT_MAX_BYTES) {
    return { errors: [{ row: 1, field: "file", message: "CSV file is too large. Import up to 200 products at a time." }], products: [] };
  }

  let rows;
  try {
    rows = parse(csv, { bom: true, skip_empty_lines: true, trim: true, relax_column_count: false });
  } catch (error) {
    return { errors: [{ row: 1, field: "file", message: `CSV could not be read: ${error.message}` }], products: [] };
  }
  if (rows.length < 2) {
    return { errors: [{ row: 1, field: "file", message: "Add at least one product row below the header" }], products: [] };
  }
  if (rows.length - 1 > PRODUCT_IMPORT_MAX_ROWS) {
    return { errors: [{ row: 1, field: "file", message: `Import up to ${PRODUCT_IMPORT_MAX_ROWS} products at a time` }], products: [] };
  }

  const headers = rows[0].map(normalizeImportHeader);
  const headerMap = new Map();
  headers.forEach((header, index) => {
    if (PRODUCT_IMPORT_COLUMNS[header] && !headerMap.has(PRODUCT_IMPORT_COLUMNS[header])) {
      headerMap.set(PRODUCT_IMPORT_COLUMNS[header], index);
    }
  });
  const missing = ["name", "buyingPrice", "sellingPrice"].filter((field) => !headerMap.has(field));
  if (missing.length) {
    return { errors: [{ row: 1, field: "header", message: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}` }], products: [] };
  }

  const errors = [];
  const products = [];
  const localBarcodes = new Set();
  for (let index = 1; index < rows.length; index += 1) {
    const row = index + 1;
    const values = rows[index];
    const get = (field) => {
      const column = headerMap.get(field);
      return column === undefined ? undefined : values[column];
    };
    const name = String(get("name") || "").trim();
    const sku = String(get("sku") || "").trim() || null;
    const unit = String(get("unit") || "pcs").trim() || "pcs";
    if (!name) errors.push({ row, field: "name", message: "name is required" });
    if (name.length > 150) errors.push({ row, field: "name", message: "name must be 150 characters or less" });
    if (sku && sku.length > 100) errors.push({ row, field: "sku", message: "sku must be 100 characters or less" });
    if (unit.length > 30) errors.push({ row, field: "unit", message: "unit must be 30 characters or less" });

    const buyingPrice = parseImportInteger(get("buyingPrice"), { row, field: "buyingPrice", fallback: 0, required: true, errors });
    const sellingPrice = parseImportInteger(get("sellingPrice"), { row, field: "sellingPrice", fallback: 0, required: true, errors });
    const currentStock = parseImportInteger(get("currentStock"), { row, field: "currentStock", fallback: 0, errors });
    const minimumStock = parseImportInteger(get("minimumStock"), { row, field: "minimumStock", fallback: 5, errors });
    const doesNotExpire = parseImportBoolean(get("doesNotExpire"), row, errors);
    const expiryDate = doesNotExpire ? null : parseImportDate(get("expiryDate"), row, errors);
    const barcodeCheck = validateBarcode(get("barcode"));
    if (barcodeCheck.error) errors.push({ row, field: "barcode", message: barcodeCheck.error });
    if (barcodeCheck.value && localBarcodes.has(barcodeCheck.value)) {
      errors.push({ row, field: "barcode", message: "barcode is repeated in this CSV" });
    }
    if (barcodeCheck.value) localBarcodes.add(barcodeCheck.value);

    products.push({ name, sku, unit, buyingPrice, sellingPrice, currentStock, minimumStock, doesNotExpire, expiryDate, barcode: barcodeCheck.value });
  }
  return { errors, products };
}

const list = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { lowStock, search, page = 1, limit = 50 } = req.query;
  const pageNumber = Number(page);
  const limitNumber = Number(limit);
  const skip = (pageNumber - 1) * limitNumber;

  const where = { shopId, isActive: true };
  if (search) where.OR = [
    { name: { contains: search, mode: "insensitive" } },
    { sku: { contains: search, mode: "insensitive" } },
    { barcode: { contains: String(search).trim().toUpperCase() } },
  ];

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { supplier: { select: { id: true, name: true, phone: true } } },
      orderBy: { name: "asc" },
      skip,
      take: limitNumber,
    }),
    prisma.product.count({ where }),
  ]);

  const result = lowStock === "true"
    ? products.filter((p) => p.currentStock <= p.minimumStock)
    : products;

  res.json({
    products: result.map((product) => redactProduct(product, req)),
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      totalPages: Math.ceil(total / limitNumber),
    },
  });
});

const get = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const product = await prisma.product.findFirst({
    where: { id: req.params.id, shopId },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      stockMovements: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json({ product: redactProduct(product, req) });
});

const create = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { name, sku, unit, buyingPrice, sellingPrice, wholesalePrice, wholesaleMinQty, currentStock, minimumStock, supplierId, expiryDate, doesNotExpire, barcode: rawBarcode, barcodeType, generateBarcode } = req.body;

  if (!name || buyingPrice == null || sellingPrice == null) {
    return res.status(400).json({ error: "name, buyingPrice, and sellingPrice are required" });
  }
  const initialStock = currentStock === undefined || currentStock === "" ? 0 : Number(currentStock);
  if (!Number.isInteger(initialStock) || initialStock < 0) {
    return res.status(400).json({ error: "Current stock must be a whole number 0 or greater" });
  }
  const retailPrice = Number(sellingPrice);
  const parsedWholesalePrice = wholesalePrice != null && wholesalePrice !== "" ? Number(wholesalePrice) : null;
  if (parsedWholesalePrice != null && parsedWholesalePrice > retailPrice) {
    return res.status(400).json({ error: "Wholesale price cannot be higher than the retail selling price" });
  }

  const checked = validateBarcode(rawBarcode);
  if (checked.error) return res.status(400).json({ error: checked.error });
  if (generateBarcode && !canGenerateBarcode(req)) return res.status(403).json({ error: "Only an admin or manager can generate barcodes" });
  if (generateBarcode) {
    const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { barcodeGenerationEnabled: true } });
    if (shop?.barcodeGenerationEnabled === false) return res.status(403).json({ error: "Barcode generation is disabled in settings" });
  }
  const product = await prisma.$transaction(async (tx) => {
    const barcode = generateBarcode ? await nextInternalBarcode(tx) : checked.value;
    if (barcode) {
      const duplicate = await tx.product.findUnique({ where: { barcode }, select: { id: true } });
      if (duplicate) throw Object.assign(new Error("This barcode is already used by another product."), { status: 409, code: "BARCODE_DUPLICATE" });
    }
    const created = await tx.product.create({
      data: {
      name,
      sku,
      unit: unit || "pcs",
      buyingPrice: Number(buyingPrice),
      sellingPrice: retailPrice,
      wholesalePrice: parsedWholesalePrice,
      wholesaleMinQty: wholesaleMinQty != null && wholesaleMinQty !== "" ? Number(wholesaleMinQty) : null,
      currentStock: initialStock,
      minimumStock: minimumStock === undefined || minimumStock === "" ? 5 : Number(minimumStock),
      shopId,
      supplierId: supplierId || null,
      doesNotExpire: Boolean(doesNotExpire),
      expiryDate: doesNotExpire ? null : (expiryDate ? new Date(expiryDate) : null),
      barcode,
      barcodeType: barcode ? inferBarcodeType(barcode, generateBarcode ? "INTERNAL" : barcodeType) : null,
      barcodeGenerated: Boolean(generateBarcode),
      barcodeCreatedAt: barcode ? new Date() : null,
      barcodeUpdatedAt: barcode ? new Date() : null,
    },
      include: { supplier: { select: { id: true, name: true, phone: true } } },
    });

    // The product and its opening balance must commit together.
    if (created.currentStock > 0) {
      await tx.stockMovement.create({
        data: {
          type: "IN",
          quantity: created.currentStock,
          note: "Initial stock",
          productId: created.id,
        },
      });
    }
    return created;
  });

  res.status(201).json({ product: redactProduct(product, req) });
});

const update = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, shopId } });
  if (!existing) return res.status(404).json({ error: "Product not found" });

  if (Object.prototype.hasOwnProperty.call(req.body, "currentStock") && Number(req.body.currentStock) !== existing.currentStock) {
    const lang = getRequestLanguage(req);
    return res.status(400).json({
      error: lang === "sw"
        ? "Stock haiwezi kubadilishwa kupitia taarifa za bidhaa. Tumia Ongeza/Punguza stock ili mabadiliko yawekwe kwenye historia."
        : "Stock cannot be changed through product details. Use Adjust stock so the change is recorded in stock history.",
      code: "STOCK_ADJUSTMENT_REQUIRED",
      supportedEndpoint: "POST /api/stock/adjust",
    });
  }

  const { name, sku, unit, buyingPrice, sellingPrice, wholesalePrice, wholesaleMinQty, minimumStock, supplierId, isActive, expiryDate, doesNotExpire, barcode: rawBarcode, barcodeType, generateBarcode } = req.body;
  const nextSellingPrice = sellingPrice === undefined ? existing.sellingPrice : Number(sellingPrice);
  const nextWholesalePrice = wholesalePrice === undefined
    ? existing.wholesalePrice
    : wholesalePrice === null || wholesalePrice === "" ? null : Number(wholesalePrice);
  if (nextWholesalePrice != null && nextWholesalePrice > nextSellingPrice) {
    return res.status(400).json({ error: "Wholesale price cannot be higher than the retail selling price" });
  }

  const checked = rawBarcode === undefined ? { value: undefined } : validateBarcode(rawBarcode);
  if (checked.error) return res.status(400).json({ error: checked.error });
  if (generateBarcode && !canGenerateBarcode(req)) return res.status(403).json({ error: "Only an admin or manager can generate barcodes" });
  if (generateBarcode) {
    const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { barcodeGenerationEnabled: true } });
    if (shop?.barcodeGenerationEnabled === false) return res.status(403).json({ error: "Barcode generation is disabled in settings" });
  }
  let barcode = checked.value;
  if (generateBarcode) barcode = await prisma.$transaction((tx) => nextInternalBarcode(tx));
  if (barcode && barcode !== existing.barcode) {
    const duplicate = await prisma.product.findUnique({ where: { barcode }, select: { id: true } });
    if (duplicate) {
      req.audit = { action: "barcode.duplicate_attempt", resourceType: "product", resourceId: existing.id, metadata: { shopId, barcode } };
      return res.status(409).json({ error: "This barcode is already used by another product." });
    }
  }
  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined && { name }),
      ...(sku !== undefined && { sku }),
      ...(unit !== undefined && { unit }),
      ...(buyingPrice !== undefined && { buyingPrice: Number(buyingPrice) }),
      ...(sellingPrice !== undefined && { sellingPrice: nextSellingPrice }),
      ...(wholesalePrice !== undefined && { wholesalePrice: nextWholesalePrice }),
      ...(wholesaleMinQty !== undefined && { wholesaleMinQty: wholesaleMinQty === null || wholesaleMinQty === "" ? null : Number(wholesaleMinQty) }),
      ...(minimumStock !== undefined && { minimumStock: Number(minimumStock) }),
      ...(supplierId !== undefined && { supplierId }),
      ...(isActive !== undefined && { isActive }),
      ...(doesNotExpire !== undefined && { doesNotExpire: Boolean(doesNotExpire) }),
      ...(doesNotExpire !== undefined && doesNotExpire ? { expiryDate: null } :
          expiryDate !== undefined ? { expiryDate: expiryDate ? new Date(expiryDate) : null } : {}),
      ...(barcode !== undefined && {
        barcode,
        barcodeType: barcode ? inferBarcodeType(barcode, generateBarcode ? "INTERNAL" : barcodeType) : null,
        barcodeGenerated: Boolean(generateBarcode) || (barcode === existing.barcode ? existing.barcodeGenerated : false),
        barcodeCreatedAt: barcode && !existing.barcode ? new Date() : existing.barcodeCreatedAt,
        barcodeUpdatedAt: new Date(),
      }),
    },
    include: { supplier: { select: { id: true, name: true, phone: true } } },
  });

  res.json({ product: redactProduct(product, req) });
});

const importCsv = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const { errors, products } = parseProductImport(req.body.csv);
  if (errors.length) {
    return res.status(400).json({
      error: "The CSV has errors. Fix them and import again.",
      code: "PRODUCT_CSV_INVALID",
      details: errors.slice(0, 20),
    });
  }

  const barcodes = products.map((product) => product.barcode).filter(Boolean);
  if (barcodes.length) {
    const existing = await prisma.product.findMany({ where: { barcode: { in: barcodes } }, select: { barcode: true } });
    if (existing.length) {
      return res.status(409).json({
        error: "One or more barcodes are already used by another product.",
        code: "BARCODE_DUPLICATE",
        details: existing.map((product) => ({ field: "barcode", message: `${product.barcode} is already in use` })),
      });
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const imported = [];
    for (const product of products) {
      const createdProduct = await tx.product.create({
        data: {
          ...product,
          barcodeType: product.barcode ? inferBarcodeType(product.barcode) : null,
          barcodeGenerated: false,
          barcodeCreatedAt: product.barcode ? new Date() : null,
          barcodeUpdatedAt: product.barcode ? new Date() : null,
          shopId,
        },
        include: { supplier: { select: { id: true, name: true, phone: true } } },
      });
      if (createdProduct.currentStock > 0) {
        await tx.stockMovement.create({
          data: { type: "IN", quantity: createdProduct.currentStock, note: "Opening stock from CSV import", productId: createdProduct.id },
        });
      }
      imported.push(createdProduct);
    }
    return imported;
  });

  req.audit = { action: "product.csv_import", resourceType: "product", metadata: { shopId, count: created.length } };
  res.status(201).json({ count: created.length, products: created.map((product) => redactProduct(product, req)) });
});

const remove = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const existing = await prisma.product.findFirst({ where: { id: req.params.id, shopId } });
  if (!existing) return res.status(404).json({ error: "Product not found" });

  // Soft delete
  await prisma.product.update({ where: { id: req.params.id }, data: { isActive: false } });
  res.json({ message: "Product deactivated" });
});

const getLowStock = asyncHandler(async (req, res) => {
  const shopId = await getShopIdForUser(req.user);
  const products = await prisma.product.findMany({
    where: { shopId, isActive: true },
    include: { supplier: { select: { id: true, name: true, phone: true } } },
    orderBy: [{ currentStock: "asc" }, { name: "asc" }],
  });
  res.json({ products: products.filter((p) => p.currentStock <= p.minimumStock).map((product) => redactProduct(product, req)) });
});

module.exports = { list, get, create, update, importCsv, remove, getLowStock };
