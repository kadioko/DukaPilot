function getRequestLanguage(req) {
  const requested = String(req.headers?.["x-dukapilot-language"] || "").trim().toLowerCase();
  return requested === "sw" ? "sw" : "en";
}

module.exports = { getRequestLanguage };
