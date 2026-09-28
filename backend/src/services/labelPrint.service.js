const VALID_LAYOUTS = new Set(["BARCODE_ONLY", "NAME_PRICE", "NAME_BARCODE", "NAME_PRICE_BARCODE", "CUSTOM"]);
const VALID_DRIVERS = new Set(["BROWSER", "PDF", "ZPL", "TSPL", "EPL", "ESCPOS"]);
const VALID_CONNECTIONS = new Set(["BROWSER", "DOWNLOAD", "BRIDGE", "NETWORK", "USB", "BLUETOOTH"]);
const VALID_FIELDS = new Set(["name", "price", "wholesalePrice", "barcode", "manufacturerBarcode", "internalBarcode", "sku", "unit", "stock", "customText"]);
const BARCODE_FIELDS = new Set(["barcode", "manufacturerBarcode", "internalBarcode"]);
const RAW_DRIVERS = new Set(["ZPL", "TSPL", "EPL", "ESCPOS"]);
const PROFILE_SECRET_KEY = /(token|secret|password|authorization|api[_-]?key)/i;

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
    customText: String(input.customText || "").replace(/[\x00-\x1F\x7F]/g, " ").trim().slice(0, 100) || null,
  };
}

function legacyConnection(input, driver) {
  if (VALID_CONNECTIONS.has(String(input.connection || "").toUpperCase())) return String(input.connection).toUpperCase();
  if (String(input.transport || "").toUpperCase() === "PRINT_BRIDGE") return "BRIDGE";
  if (["ZPL", "TSPL", "EPL", "ESCPOS"].includes(driver)) return "DOWNLOAD";
  return "BROWSER";
}

function normalizeBridgeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value).trim());
    const loopback = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname);
    if (!loopback || url.protocol !== "http:") return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function sanitizeProfileConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const config = {};
  for (const [key, raw] of Object.entries(value)) {
    if (PROFILE_SECRET_KEY.test(key) || typeof raw !== "string") continue;
    if (key === "bridgeUrl") {
      const bridgeUrl = normalizeBridgeUrl(raw);
      if (bridgeUrl) config.bridgeUrl = bridgeUrl;
    }
  }
  return Object.keys(config).length ? config : null;
}

function normalizePrinterProfile(input = {}) {
  const driver = String(input.driver || "BROWSER").toUpperCase();
  if (!VALID_DRIVERS.has(driver)) throw Object.assign(new Error("Unsupported printer driver"), { status: 400 });
  let connection = legacyConnection(input, driver);
  // Browser and PDF jobs are rendered by the browser itself. Raw languages can
  // be downloaded or routed through a supported local connection.
  if (driver === "BROWSER" || driver === "PDF") connection = "BROWSER";
  else if (!RAW_DRIVERS.has(driver) || !["DOWNLOAD", "BRIDGE", "NETWORK", "USB", "BLUETOOTH"].includes(connection)) connection = "DOWNLOAD";
  const transport = connection === "BRIDGE" || connection === "NETWORK" ? "PRINT_BRIDGE" : "BROWSER_DOWNLOAD";
  return {
    name: String(input.name || "").trim().slice(0, 80),
    driver,
    widthMm: numberInRange(input.widthMm, 40, 20, 120),
    heightMm: numberInRange(input.heightMm, 30, 20, 100),
    dpi: integerInRange(input.dpi, 203, 100, 600),
    transport,
    connection,
    model: String(input.model || "").trim().slice(0, 100) || null,
    // A bridge token is intentionally never persisted in DukaPilot's database.
    options: ["BRIDGE", "NETWORK"].includes(connection) ? sanitizeProfileConfig(input.options) : null,
    config: ["BRIDGE", "NETWORK"].includes(connection) ? sanitizeProfileConfig(input.config || input.options) : null,
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

function priceText(value) {
  return `TZS ${Number(value || 0).toLocaleString("en-US")}`;
}

function barcodeValue(product, field = "barcode") {
  if (field === "manufacturerBarcode") return printableText(product.manufacturerBarcode, 64);
  if (field === "internalBarcode") return printableText(product.internalBarcode, 64);
  return printableText(product.internalBarcode || product.barcode || product.manufacturerBarcode, 64);
}

function barcodeCommandType(product, template, field = "barcode") {
  const value = barcodeValue(product, field);
  const explicitType = String(template.barcodeType || "").toUpperCase();
  const storedType = field === "barcode" && product.barcode === value ? String(product.barcodeType || "").toUpperCase() : "";
  const type = explicitType || storedType;
  if (type === "EAN13" && /^\d{13}$/.test(value)) return "EAN13";
  if (type === "UPC" && /^\d{12}$/.test(value)) return "UPC";
  if (/^\d{13}$/.test(value)) return "EAN13";
  if (/^\d{12}$/.test(value)) return "UPC";
  return "CODE128";
}

function dots(mm, dpi) {
  return Math.max(1, Math.round((Number(mm) / 25.4) * Number(dpi || 203)));
}

function zplBarcode(product, template, field, x, y, height) {
  const value = barcodeValue(product, field);
  if (!value) return "";
  const type = barcodeCommandType(product, template, field);
  // ZPL retail barcode commands calculate the final check digit themselves.
  // Product validation already confirmed that the stored full code is valid.
  if (type === "EAN13") return `^FO${x},${y}^BEN,${height},Y,N^FD${value.slice(0, -1)}^FS`;
  if (type === "UPC") return `^FO${x},${y}^BUN,${height},Y,N^FD${value.slice(0, -1)}^FS`;
  return `^FO${x},${y}^BCN,${height},Y,N,N^FD${value}^FS`;
}

function labelTextLines(product, template, fields) {
  const lines = [];
  if (fields.includes("name")) lines.push(["name", productLabelName(product)]);
  if (fields.includes("price")) lines.push(["price", priceText(product.sellingPrice)]);
  if (fields.includes("wholesalePrice") && product.wholesalePrice != null) lines.push(["wholesale", `Wholesale ${priceText(product.wholesalePrice)}`]);
  if (fields.includes("sku") && product.sku) lines.push(["sku", `SKU ${printableText(product.sku, 40)}`]);
  if (fields.includes("unit")) lines.push(["unit", printableText(product.unit || "pcs", 16)]);
  if (fields.includes("stock")) lines.push(["stock", `Stock ${Number(product.currentStock || 0)}`]);
  if (fields.includes("customText") && template.customText) lines.push(["custom", printableText(template.customText, 100)]);
  return lines;
}

function renderZpl(items, template, profile) {
  const width = dots(template.widthMm, profile.dpi);
  const height = dots(template.heightMm, profile.dpi);
  const fields = visibleFields(template);
  const barcodeFields = fields.filter((field) => BARCODE_FIELDS.has(field));
  return items.map((product) => {
    let cursorY = 18;
    const lines = ["^XA", `^PW${width}`, `^LL${height}`, "^CI28"];
    for (const [kind, text] of labelTextLines(product, template, fields)) {
      const font = kind === "name" ? Math.min(30, Math.max(16, Math.round(height / 8))) : kind === "price" ? 20 : 16;
      lines.push(`^FO18,${cursorY}^A0N,${font}^FD${text}^FS`);
      cursorY += font + 6;
    }
    const remaining = Math.max(32, height - cursorY - 20);
    barcodeFields.forEach((field, index) => lines.push("^BY2,2,50", zplBarcode(product, template, field, 18, Math.min(cursorY + index * (remaining + 6), Math.max(44, height - remaining)), Math.min(58, remaining))));
    lines.push("^XZ");
    return lines.filter(Boolean).join("\n");
  }).join("\n");
}

function tsplBarcode(product, template, field, x, y, height) {
  const value = barcodeValue(product, field);
  if (!value) return "";
  const type = barcodeCommandType(product, template, field);
  const command = type === "EAN13" ? "EAN13" : type === "UPC" ? "UPCA" : "128";
  return `BARCODE ${x},${y},"${command}",${height},1,0,2,2,"${value}"`;
}

function renderTspl(items, template) {
  const fields = visibleFields(template);
  const barcodeFields = fields.filter((field) => BARCODE_FIELDS.has(field));
  return items.map((product) => {
    let cursorY = 16;
    const lines = [`SIZE ${template.widthMm} mm,${template.heightMm} mm`, `GAP ${template.gapMm} mm,0`, "DIRECTION 1", "CLS"];
    for (const [, text] of labelTextLines(product, template, fields)) {
      lines.push(`TEXT 16,${cursorY},"0",0,1,1,"${text}"`);
      cursorY += 22;
    }
    const maxHeight = Math.max(28, Math.round((template.heightMm * 8) - cursorY - 20));
    barcodeFields.forEach((field, index) => lines.push(tsplBarcode(product, template, field, 16, cursorY + index * (maxHeight + 8), maxHeight)));
    lines.push("PRINT 1,1");
    return lines.filter(Boolean).join("\n");
  }).join("\n");
}

function renderEpl(items, template, profile) {
  const fields = visibleFields(template);
  const barcodeFields = fields.filter((field) => BARCODE_FIELDS.has(field));
  const width = dots(template.widthMm, profile.dpi);
  const height = dots(template.heightMm, profile.dpi);
  return items.map((product) => {
    let cursorY = 16;
    const lines = ["N", `q${width}`, `Q${height},24`];
    for (const [, text] of labelTextLines(product, template, fields)) {
      lines.push(`A16,${cursorY},0,2,1,1,N,"${text}"`);
      cursorY += 24;
    }
    const barcodeHeight = Math.max(28, Math.min(80, height - cursorY - 18));
    barcodeFields.forEach((field, index) => {
      const value = barcodeValue(product, field);
      if (!value) return;
      const type = barcodeCommandType(product, template, field);
      const eplType = type === "EAN13" ? "E30" : type === "UPC" ? "UA0" : "1";
      const data = type === "EAN13" || type === "UPC" ? value.slice(0, -1) : value;
      lines.push(`B16,${cursorY + index * (barcodeHeight + 8)},0,${eplType},2,2,${barcodeHeight},N,"${data}"`);
    });
    lines.push("P1");
    return lines.join("\n");
  }).join("\n");
}

function renderEscPos(items, template) {
  const fields = visibleFields(template);
  const barcodeFields = fields.filter((field) => BARCODE_FIELDS.has(field));
  const chunks = [Buffer.from([0x1b, 0x40])];
  for (const product of items) {
    for (const [, text] of labelTextLines(product, template, fields)) chunks.push(Buffer.from(`${text}\n`, "utf8"));
    for (const field of barcodeFields) {
      const value = barcodeValue(product, field);
      if (!value) continue;
      const type = barcodeCommandType(product, template, field);
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
  if (driver === "EPL") return { encoding: "utf8", extension: "epl", contentType: "text/plain", content: renderEpl(items, template, profile) };
  if (driver === "ESCPOS") return { encoding: "base64", extension: "bin", contentType: "application/octet-stream", content: renderEscPos(items, template).toString("base64") };
  return null;
}

module.exports = {
  VALID_DRIVERS,
  VALID_CONNECTIONS,
  fieldsForLayout,
  normalizeLabelTemplate,
  normalizePrinterProfile,
  visibleFields,
  barcodeValue,
  renderPrinterOutput,
};
