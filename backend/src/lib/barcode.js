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

function validateBarcode(value) {
  const barcode = normalizeBarcode(value);
  if (!barcode) return { value: null, error: null };
  if (barcode.length < 4 || barcode.length > 64 || !/^[A-Z0-9._-]+$/.test(barcode)) {
    return { value: null, error: "Barcode must be 4-64 letters, numbers, dots, hyphens, or underscores" };
  }
  return { value: barcode, error: null };
}

async function nextInternalBarcode(tx) {
  const latest = await tx.product.findFirst({
    where: { barcode: { startsWith: "DP" } },
    select: { barcode: true },
    orderBy: { barcode: "desc" },
  });
  const previous = Number(latest?.barcode?.slice(2) || 0);
  return `DP${String(previous + 1).padStart(8, "0")}`;
}

module.exports = { normalizeBarcode, inferBarcodeType, validateBarcode, nextInternalBarcode };
