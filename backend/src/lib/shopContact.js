const { normalizePhone, isValidPhone } = require("./phone");

function resolveShopContactPhone(shop) {
  return shop?.contactPhone || shop?.parentShop?.contactPhone || shop?.parentShop?.user?.phone || shop?.user?.phone || null;
}

function normalizeShopContactPhone(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const phone = normalizePhone(value);
  if (!isValidPhone(phone)) throw Object.assign(new Error("Enter a valid customer contact phone number"), { status: 400 });
  return phone;
}

module.exports = { resolveShopContactPhone, normalizeShopContactPhone };
