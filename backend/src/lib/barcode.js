const BARCODE_TYPES = new Set(["EAN13", "UPC", "CODE128", "INTERNAL"]);

function normalizeBarcode(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function inferBarcodeType(value, requested) {
  const barcode = normalizeBarcode(value);
  if (requested && BARCODE_TYPES.has(String(requested).toUpperCase())) return String(requested).toUpperCase();
  if (/^DP\d{8}$/.test(barcode)) return "INTERNAL";
  if (/^\d{13}$/.test(barcode)) return "EAN13";
  if (/^\d{12}$/.test(barcode)) return "UPC";
  return "CODE128";
}

function checksumDigit(value) {
  const digits = String(value).split("").map(Number);
  const sum = digits.reduce((total, digit, index) => total + digit * ((digits.length - index) % 2 === 1 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

function normalizeSku(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function validateSku(value) {
  const sku = normalizeSku(value);
  if (!sku) return { value: null, error: null };
  if (sku.length > 100 || !/^[A-Z0-9._-]+$/.test(sku)) {
    return { value: null, error: "SKU must be up to 100 letters, numbers, dots, hyphens, or underscores" };
  }
  return { value: sku, error: null };
}

function validateBarcode(value, requestedType) {
  const barcode = normalizeBarcode(value);
  if (!barcode) return { value: null, error: null };
  if (barcode.length < 4 || barcode.length > 64 || !/^[A-Z0-9._-]+$/.test(barcode)) {
    return { value: null, error: "Barcode must be 4-64 letters, numbers, dots, hyphens, or underscores" };
  }
  const type = inferBarcodeType(barcode, requestedType);
  if (type === "EAN13" && (!/^\d{13}$/.test(barcode) || checksumDigit(barcode.slice(0, 12)) !== barcode.at(-1))) {
    return { value: null, error: "EAN-13 barcode must contain 13 digits with a valid check digit" };
  }
  if (type === "UPC" && (!/^\d{12}$/.test(barcode) || checksumDigit(barcode.slice(0, 11)) !== barcode.at(-1))) {
    return { value: null, error: "UPC barcode must contain 12 digits with a valid check digit" };
  }
  return { value: barcode, error: null, type };
}

async function nextInternalBarcode(tx, shopId) {
  const shop = await tx.shop.update({
    where: { id: shopId },
    data: { nextBarcodeNumber: { increment: 1 } },
    select: { nextBarcodeNumber: true },
  });
  return `DP${String(shop.nextBarcodeNumber).padStart(8, "0")}`;
}

async function nextInternalSku(tx, shopId) {
  const shop = await tx.shop.update({
    where: { id: shopId },
    data: { nextSkuNumber: { increment: 1 } },
    select: { nextSkuNumber: true },
  });
  return `DPSKU${String(shop.nextSkuNumber).padStart(6, "0")}`;
}

module.exports = { normalizeBarcode, inferBarcodeType, validateBarcode, normalizeSku, validateSku, nextInternalBarcode, nextInternalSku };
