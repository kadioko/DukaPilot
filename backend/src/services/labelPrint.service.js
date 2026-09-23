const VALID_LAYOUTS = new Set(["BARCODE_ONLY", "NAME_PRICE", "NAME_BARCODE", "NAME_PRICE_BARCODE", "CUSTOM"]);
const VALID_DRIVERS = new Set(["BROWSER", "PDF", "ZPL", "TSPL", "ESCPOS"]);
const VALID_FIELDS = new Set(["name", "price", "barcode", "sku", "unit", "stock"]);

function numberInRange(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function integerInRange(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function fieldsForLayout(layout) {
  if (layout === "BARCODE_ONLY") return ["barcode"];
  if (layout === "NAME_PRICE") return ["name", "price"];
  if (layout === "NAME_BARCODE") return ["name", "barcode"];
  return ["name", "price", "barcode"];
}

function normalizeLabelTemplate(input = {}) {
  const layout = VALID_LAYOUTS.has(String(input.layout || "").toUpperCase()) ? String(input.layout).toUpperCase() : "NAME_PRICE_BARCODE";
  const requestedFields = Array.isArray(input.fields) ? input.fields.map(String).filter((field) => VALID_FIELDS.has(field)) : [];
  return {
    name: String(input.name || "40 x 30 mm").trim().slice(0, 80) || "40 x 30 mm",
    layout,
    widthMm: numberInRange(input.widthMm, 40, 20, 120),
    heightMm: numberInRange(input.heightMm, 30, 20, 100),
    columns: integerInRange(input.columns, 1, 1, 6),
    gapMm: numberInRange(input.gapMm, 2, 0, 10),
    fields: layout === "CUSTOM" ? (requestedFields.length ? requestedFields : fieldsForLayout("NAME_PRICE_BARCODE")) : fieldsForLayout(layout),
    barcodeType: ["EAN13", "UPC", "CODE128", "INTERNAL"].includes(String(input.barcodeType || "").toUpperCase()) ? String(input.barcodeType).toUpperCase() : null,
  };
}

function normalizePrinterProfile(input = {}) {
  const driver = String(input.driver || "BROWSER").toUpperCase();
  if (!VALID_DRIVERS.has(driver)) throw Object.assign(new Error("Unsupported printer driver"), { status: 400 });
  const transport = String(input.transport || "BROWSER_DOWNLOAD").toUpperCase();
  if (!["BROWSER_DOWNLOAD", "QZ_TRAY", "PRINT_BRIDGE"].includes(transport)) throw Object.assign(new Error("Unsupported printer transport"), { status: 400 });
  return {
    name: String(input.name || "").trim().slice(0, 80),
    driver,
    widthMm: numberInRange(input.widthMm, 40, 20, 120),
    heightMm: numberInRange(input.heightMm, 30, 20, 100),
    dpi: integerInRange(input.dpi, 203, 100, 600),
    transport,
    options: input.options && typeof input.options === "object" && !Array.isArray(input.options) ? input.options : null,
  };
}

function visibleFields(template) {
  return Array.isArray(template.fields) && template.fields.length ? template.fields.filter((field) => VALID_FIELDS.has(field)) : fieldsForLayout(template.layout);
}

function printableText(value, maxLength = 80) {
  return String(value == null ? "" : value).replace(/[\x00-\x1F\x7F]/g, " ").replace(/[\^~"\\]/g, " ").trim().slice(0, maxLength);
}

function productLabelName(product) {
  return printableText(product.labelName || product.name || "DukaPilot");
}

function priceText(product) {
  return `TZS ${Number(product.sellingPrice || 0).toLocaleString("en-US")}`;
}

function barcodeCommandType(product, template) {
  const type = String(template.barcodeType || product.barcodeType || "CODE128").toUpperCase();
  if (type === "EAN13" && /^\d{13}$/.test(product.barcode || "")) return "EAN13";
  if (type === "UPC" && /^\d{12}$/.test(product.barcode || "")) return "UPC";
  return "CODE128";
}

function dots(mm, dpi) {
  return Math.max(1, Math.round((Number(mm) / 25.4) * Number(dpi || 203)));
}

function zplBarcode(product, template, x, y, height) {
  const value = printableText(product.barcode, 64);
  if (!value) return "";
  const type = barcodeCommandType(product, template);
  if (type === "EAN13") return `^FO${x},${y}^BEN,${height},Y,N^FD${value}^FS`;
  if (type === "UPC") return `^FO${x},${y}^BUN,${height},Y,N^FD${value}^FS`;
  return `^FO${x},${y}^BCN,${height},Y,N,N^FD${value}^FS`;
}

function renderZpl(items, template, profile) {
  const width = dots(template.widthMm, profile.dpi);
  const height = dots(template.heightMm, profile.dpi);
  const fields = visibleFields(template);
  return items.map((product) => {
    let cursorY = 18;
    const lines = ["^XA", `^PW${width}`, `^LL${height}`, "^CI28"];
    if (fields.includes("name")) { lines.push(`^FO18,${cursorY}^A0N,${Math.min(30, Math.max(16, Math.round(height / 8)))}^FD${productLabelName(product)}^FS`); cursorY += 34; }
    if (fields.includes("price")) { lines.push(`^FO18,${cursorY}^A0N,20^FD${priceText(product)}^FS`); cursorY += 26; }
    if (fields.includes("sku") && product.sku) { lines.push(`^FO18,${cursorY}^A0N,16^FDSKU ${printableText(product.sku, 40)}^FS`); cursorY += 22; }
    if (fields.includes("unit")) { lines.push(`^FO${Math.floor(width * 0.65)},${cursorY - 22}^A0N,16^FD${printableText(product.unit || "pcs", 16)}^FS`); }
    if (fields.includes("stock")) { lines.push(`^FO18,${cursorY}^A0N,16^FDStock ${Number(product.currentStock || 0)}^FS`); cursorY += 22; }
    if (fields.includes("barcode")) lines.push("^BY2,2,50", zplBarcode(product, template, 18, Math.min(cursorY, Math.max(44, height - 85)), Math.min(58, Math.max(36, height - cursorY - 24))));
    lines.push("^XZ");
    return lines.filter(Boolean).join("\n");
  }).join("\n");
}

function tsplBarcode(product, template, x, y, height) {
  const value = printableText(product.barcode, 64);
  if (!value) return "";
  const type = barcodeCommandType(product, template);
  const command = type === "EAN13" ? "EAN13" : type === "UPC" ? "UPCA" : "128";
  return `BARCODE ${x},${y},"${command}",${height},1,0,2,2,"${value}"`;
}

function renderTspl(items, template) {
  const fields = visibleFields(template);
  return items.map((product) => {
    let cursorY = 16;
    const lines = [`SIZE ${template.widthMm} mm,${template.heightMm} mm`, `GAP ${template.gapMm} mm,0`, "DIRECTION 1", "CLS"];
    if (fields.includes("name")) { lines.push(`TEXT 16,${cursorY},"0",0,1,1,"${productLabelName(product)}"`); cursorY += 26; }
    if (fields.includes("price")) { lines.push(`TEXT 16,${cursorY},"0",0,1,1,"${priceText(product)}"`); cursorY += 24; }
    if (fields.includes("sku") && product.sku) { lines.push(`TEXT 16,${cursorY},"0",0,1,1,"SKU ${printableText(product.sku, 40)}"`); cursorY += 22; }
    if (fields.includes("stock")) { lines.push(`TEXT 16,${cursorY},"0",0,1,1,"Stock ${Number(product.currentStock || 0)}"`); cursorY += 22; }
    if (fields.includes("barcode")) lines.push(tsplBarcode(product, template, 16, cursorY, Math.max(28, Math.round((template.heightMm * 8) - cursorY - 20))));
    lines.push("PRINT 1,1");
    return lines.filter(Boolean).join("\n");
  }).join("\n");
}

function renderEscPos(items, template) {
  const fields = visibleFields(template);
  const chunks = [Buffer.from([0x1b, 0x40])];
  for (const product of items) {
    if (fields.includes("name")) chunks.push(Buffer.from(`${productLabelName(product)}\n`, "utf8"));
    if (fields.includes("price")) chunks.push(Buffer.from(`${priceText(product)}\n`, "utf8"));
    if (fields.includes("sku") && product.sku) chunks.push(Buffer.from(`SKU ${printableText(product.sku, 40)}\n`, "utf8"));
    if (fields.includes("stock")) chunks.push(Buffer.from(`Stock ${Number(product.currentStock || 0)}\n`, "utf8"));
    if (fields.includes("barcode") && product.barcode) {
      const value = printableText(product.barcode, 64);
      const type = barcodeCommandType(product, template);
      if (type === "CODE128") {
        const encoded = Buffer.from(`{B${value}`, "ascii");
        chunks.push(Buffer.from([0x1d, 0x6b, 73, encoded.length]), encoded, Buffer.from("\n", "ascii"));
      } else {
        const mode = type === "EAN13" ? 67 : 65;
        chunks.push(Buffer.from([0x1d, 0x6b, mode]), Buffer.from(value, "ascii"), Buffer.from([0x00, 0x0a]));
      }
    }
    chunks.push(Buffer.from("\n", "ascii"));
  }
  chunks.push(Buffer.from([0x1d, 0x56, 0x00]));
  return Buffer.concat(chunks);
}

function renderPrinterOutput(driver, items, template, profile) {
  if (driver === "ZPL") return { encoding: "utf8", extension: "zpl", contentType: "text/plain", content: renderZpl(items, template, profile) };
  if (driver === "TSPL") return { encoding: "utf8", extension: "tspl", contentType: "text/plain", content: renderTspl(items, template, profile) };
  if (driver === "ESCPOS") return { encoding: "base64", extension: "bin", contentType: "application/octet-stream", content: renderEscPos(items, template).toString("base64") };
  return null;
}

module.exports = {
  VALID_DRIVERS,
  fieldsForLayout,
  normalizeLabelTemplate,
  normalizePrinterProfile,
  visibleFields,
  renderPrinterOutput,
};
