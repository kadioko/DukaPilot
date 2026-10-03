const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeShopContactPhone, resolveShopContactPhone } = require("../src/lib/shopContact");

test("branch contact overrides the main business contact without changing account phone", () => {
  const shop = {
    contactPhone: "+255 713 712 057",
    user: { phone: "+255743910580" },
    parentShop: { contactPhone: "+255743910580", user: { phone: "+255743910580" } },
  };
  assert.equal(resolveShopContactPhone(shop), "+255 713 712 057");
  assert.equal(shop.user.phone, "+255743910580");
});

test("branch without an override inherits the main public contact before account fallback", () => {
  assert.equal(resolveShopContactPhone({ user: { phone: "+255700000001" }, parentShop: { contactPhone: "+255713712057", user: { phone: "+255743910580" } } }), "+255713712057");
  assert.equal(resolveShopContactPhone({ user: { phone: "+255700000001" }, parentShop: { contactPhone: null, user: { phone: "+255743910580" } } }), "+255743910580");
});

test("main shop contact falls back to its account number", () => {
  assert.equal(resolveShopContactPhone({ contactPhone: null, user: { phone: "+255743910580" } }), "+255743910580");
  assert.equal(resolveShopContactPhone({ contactPhone: "+255713712057", user: { phone: "+255743910580" } }), "+255713712057");
});

test("optional shop contact numbers normalize Tanzania numbers and reject invalid values", () => {
  assert.equal(normalizeShopContactPhone("0743 910 580"), "+255743910580");
  assert.equal(normalizeShopContactPhone("  "), null);
  assert.throws(() => normalizeShopContactPhone("not a phone"), { status: 400 });
});
