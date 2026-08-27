function redactPublicQuotationToken(value) {
  return String(value || "").replace(/(\/api\/public\/quotations\/)[^/?#]+/gi, "$1[token]");
}

module.exports = { redactPublicQuotationToken };
