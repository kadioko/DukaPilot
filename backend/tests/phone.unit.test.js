const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhone, phoneLookupValues, isValidPhone } = require("../src/lib/phone");

test("Tanzanian 07 and 255 formats normalize to one login number", () => {
  assert.equal(normalizePhone("0743 910 580"), "+255743910580");
  assert.equal(normalizePhone("255743910580"), "+255743910580");
  assert.equal(normalizePhone("+255743910580"), "+255743910580");
  assert.equal(isValidPhone("0743910580"), true);
  assert.equal(phoneLookupValues("0743910580").includes("+255743910580"), true);
});
