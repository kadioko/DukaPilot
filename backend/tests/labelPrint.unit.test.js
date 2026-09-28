const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeLabelTemplate, normalizePrinterProfile, renderPrinterOutput } = require("../src/services/labelPrint.service");

const product = { id: "product-1", name: "Sukari 1kg", labelName: "Sukari", sku: "SKR001", barcode: "DP00000001", internalBarcode: "DP00000001", manufacturerBarcode: "4006381333931", barcodeType: "INTERNAL", unit: "pcs", currentStock: 12, sellingPrice: 3200, wholesalePrice: 2900 };

test("label templates use a safe 40 by 30 mm default and support custom fields", () => {
  const standard = normalizeLabelTemplate({});
  assert.equal(standard.widthMm, 40);
  assert.equal(standard.heightMm, 30);
  const custom = normalizeLabelTemplate({ layout: "CUSTOM", fields: ["name", "wholesalePrice", "manufacturerBarcode", "internalBarcode", "customText", "unknown"], customText: "Offer today" });
  assert.deepEqual(custom.fields, ["name", "wholesalePrice", "manufacturerBarcode", "internalBarcode", "customText"]);
  assert.equal(custom.customText, "Offer today");
});

test("printer renderers generate independent ZPL, TSPL, EPL, and ESC/POS output", () => {
  const template = normalizeLabelTemplate({ layout: "NAME_PRICE_BARCODE" });
  const profile = normalizePrinterProfile({ name: "Test", driver: "ZPL", dpi: 203 });
  const zpl = renderPrinterOutput("ZPL", [product], template, profile);
  assert.match(zpl.content, /\^BCN/);
  assert.match(zpl.content, /Sukari/);
  const tspl = renderPrinterOutput("TSPL", [product], template, profile);
  assert.match(tspl.content, /BARCODE .*"128"/);
  const epl = renderPrinterOutput("EPL", [product], template, profile);
  assert.match(epl.content, /^N/m);
  assert.match(epl.content, /B16,/);
  const escpos = renderPrinterOutput("ESCPOS", [product], template, profile);
  assert.equal(escpos.encoding, "base64");
  assert.ok(Buffer.from(escpos.content, "base64").length > 10);
  const safeTspl = renderPrinterOutput("TSPL", [{ ...product, name: 'Sukari "^TEST' }], template, profile);
  assert.doesNotMatch(safeTspl.content, /\^TEST/);
});

test("printer profiles preserve only safe loopback bridge configuration", () => {
  const profile = normalizePrinterProfile({ name: "Counter", driver: "TSPL", connection: "NETWORK", model: "XP-D281B", config: { bridgeUrl: "http://127.0.0.1:9123", token: "never-store-me" } });
  assert.equal(profile.connection, "NETWORK");
  assert.equal(profile.config.bridgeUrl, "http://127.0.0.1:9123");
  assert.equal("token" in profile.config, false);
  assert.equal(normalizePrinterProfile({ name: "Bad", driver: "TSPL", config: { bridgeUrl: "https://printer.example" } }).config, null);
});
