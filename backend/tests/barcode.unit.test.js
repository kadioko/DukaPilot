const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeBarcode, inferBarcodeType, validateBarcode, validateSku, nextInternalBarcode, nextInternalSku } = require("../src/lib/barcode");

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

test("EAN-13 and UPC values require a correct check digit", () => {
  assert.equal(validateBarcode("4006381333931", "EAN13").error, null);
  assert.match(validateBarcode("4006381333932", "EAN13").error, /check digit/);
  assert.equal(validateBarcode("036000291452", "UPC").error, null);
  assert.match(validateBarcode("036000291453", "UPC").error, /check digit/);
});

test("SKU values normalize safely and internal sequences use the current shop", async () => {
  assert.equal(validateSku(" dp sku-01 ").value, "DPSKU-01");
  assert.match(validateSku("dp/@sku").error, /SKU/);
  const tx = { shop: { update: async ({ data }) => ({ nextBarcodeNumber: data.nextBarcodeNumber ? 42 : undefined, nextSkuNumber: data.nextSkuNumber ? 7 : undefined }) } };
  assert.equal(await nextInternalBarcode(tx, "shop-1"), "DP00000042");
  assert.equal(await nextInternalSku(tx, "shop-1"), "DPSKU000007");
});
