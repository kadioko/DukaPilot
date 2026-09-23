const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeLabelTemplate, normalizePrinterProfile, renderPrinterOutput } = require("../src/services/labelPrint.service");

const product = { id: "product-1", name: "Sukari 1kg", labelName: "Sukari", sku: "SKR001", barcode: "4006381333931", barcodeType: "EAN13", unit: "pcs", currentStock: 12, sellingPrice: 3200 };

test("label templates use a safe 40 by 30 mm default and support custom fields", () => {
  const standard = normalizeLabelTemplate({});
  assert.equal(standard.widthMm, 40);
  assert.equal(standard.heightMm, 30);
  const custom = normalizeLabelTemplate({ layout: "CUSTOM", fields: ["name", "sku", "stock", "unknown"] });
  assert.deepEqual(custom.fields, ["name", "sku", "stock"]);
});

test("printer renderers generate independent ZPL, TSPL, and ESC/POS output", () => {
  const template = normalizeLabelTemplate({ layout: "NAME_PRICE_BARCODE" });
  const profile = normalizePrinterProfile({ name: "Test", driver: "ZPL", dpi: 203 });
  const zpl = renderPrinterOutput("ZPL", [product], template, profile);
  assert.match(zpl.content, /\^BEN/);
  assert.match(zpl.content, /Sukari/);
  const tspl = renderPrinterOutput("TSPL", [product], template, profile);
  assert.match(tspl.content, /BARCODE .*"EAN13"/);
  const escpos = renderPrinterOutput("ESCPOS", [product], template, profile);
  assert.equal(escpos.encoding, "base64");
  assert.ok(Buffer.from(escpos.content, "base64").length > 10);
  const safeTspl = renderPrinterOutput("TSPL", [{ ...product, name: 'Sukari "^TEST' }], template, profile);
  assert.doesNotMatch(safeTspl.content, /\^TEST/);
});
