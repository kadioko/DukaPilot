const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeBarcode, inferBarcodeType, validateBarcode } = require("../src/lib/barcode");

test("barcode normalization preserves scanner values while removing whitespace", () => {
  assert.equal(normalizeBarcode("  dp00000001 \n"), "DP00000001");
  assert.equal(inferBarcodeType("DP00000001"), "INTERNAL");
  assert.equal(inferBarcodeType("6161101234567"), "EAN13");
  assert.equal(inferBarcodeType("012345678905"), "UPC");
});

test("barcode validation rejects unsafe or too-short values", () => {
  assert.equal(validateBarcode("DP00000001").value, "DP00000001");
  assert.match(validateBarcode("abc/@def").error, /Barcode/);
  assert.match(validateBarcode("123").error, /Barcode/);
});
