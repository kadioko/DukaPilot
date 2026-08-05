function compactPhone(value) {
  return String(value || "").replace(/[\s()-]/g, "").trim();
}

// DukaPilot stores Tanzanian mobile numbers in one canonical form. The lookup
// variants keep older accounts accessible while their details are gradually updated.
function normalizePhone(value) {
  const raw = compactPhone(value);
  const digits = raw.replace(/\D/g, "");
  if (/^0[67]\d{8}$/.test(digits)) return `+255${digits.slice(1)}`;
  if (/^255[67]\d{8}$/.test(digits)) return `+${digits}`;
  return raw;
}

function phoneLookupValues(value) {
  const raw = compactPhone(value);
  const normalized = normalizePhone(raw);
  const digits = raw.replace(/\D/g, "");
  return [...new Set([normalized, raw, digits ? `+${digits}` : "", digits].filter(Boolean))];
}

function isValidPhone(value) {
  return /^\+?[1-9]\d{8,14}$/.test(normalizePhone(value));
}

module.exports = { normalizePhone, phoneLookupValues, isValidPhone };
