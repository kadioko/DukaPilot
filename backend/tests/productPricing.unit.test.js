const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { activeRetailPrice, normalizePromotion } = require(path.resolve(__dirname, "../src/lib/productPricing.js"));

test("scheduled promotion is active only within its half-open time window", () => {
  const product = {
    sellingPrice: 5000,
    promotionPrice: 4200,
    promotionStartsAt: new Date("2026-10-06T10:00:00Z"),
    promotionEndsAt: new Date("2026-10-07T10:00:00Z"),
  };
  assert.equal(activeRetailPrice(product, new Date("2026-10-06T09:59:59Z")), 5000);
  assert.equal(activeRetailPrice(product, new Date("2026-10-06T10:00:00Z")), 4200);
  assert.equal(activeRetailPrice(product, new Date("2026-10-07T10:00:00Z")), 5000);
});

test("promotion validation requires complete fields, an integer discount, and a valid time range", () => {
  const base = { sellingPrice: 5000 };
  const valid = { promotionPrice: 4200, promotionStartsAt: "2026-10-06T10:00:00Z", promotionEndsAt: "2026-10-07T10:00:00Z" };
  assert.equal(normalizePromotion(valid, base).data.promotionPrice, 4200);
  assert.match(normalizePromotion({ ...valid, promotionEndsAt: "" }, base).error, /together/);
  assert.match(normalizePromotion({ ...valid, promotionPrice: 5000 }, base).error, /below/);
  assert.match(normalizePromotion({ ...valid, promotionStartsAt: "bad" }, base).error, /after/);
  assert.match(normalizePromotion(valid, { ...base, isInternalUse: true }).error, /Internal-use/);
});
