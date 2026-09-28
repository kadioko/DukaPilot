const { PROTOCOLS } = require("./config");

function fail(message, code = "INVALID_REQUEST", status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  throw error;
}

function asProtocol(value) {
  const protocol = String(value || "").trim().toUpperCase();
  if (!PROTOCOLS.has(protocol)) fail("protocol must be TSPL, ZPL, EPL, or ESCPOS", "INVALID_PROTOCOL");
  return protocol;
}

function validatePayload(payload, maxBytes) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("JSON object required");
  const printerId = String(payload.printerId || "default").trim();
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(printerId)) fail("printerId is invalid");
  const protocol = asProtocol(payload.protocol);
  if (typeof payload.data !== "string" || !payload.data.length) fail("data is required");
  if (protocol === "ESCPOS") {
    if (!/^[0-9a-fA-F]+$/.test(payload.data) || payload.data.length % 2 !== 0) fail("ESC/POS data must be hexadecimal", "INVALID_ESCPOS_DATA");
    const data = Buffer.from(payload.data, "hex");
    if (data.length > maxBytes) fail("Print payload is too large", "PAYLOAD_TOO_LARGE", 413);
    return { printerId, protocol, data };
  }
  if (payload.data.includes("\0")) fail("Print data cannot contain null bytes");
  const data = Buffer.from(payload.data, "utf8");
  if (data.length > maxBytes) fail("Print payload is too large", "PAYLOAD_TOO_LARGE", 413);
  return { printerId, protocol, data };
}

function testPayload(protocol) {
  switch (asProtocol(protocol)) {
    case "TSPL": return Buffer.from("SIZE 40 mm,30 mm\r\nGAP 2 mm,0\r\nCLS\r\nTEXT 20,20,\"0\",0,1,1,\"DukaPilot test\"\r\nPRINT 1,1\r\n", "utf8");
    case "ZPL": return Buffer.from("^XA^PW320^LL240^FO20,20^A0N,28,28^FDDukaPilot test^FS^XZ", "utf8");
    case "EPL": return Buffer.from("N\nq320\nQ240,24\nA20,20,0,3,1,1,N,\"DukaPilot test\"\nP1\n", "utf8");
    case "ESCPOS": return Buffer.from([0x1b, 0x40, ...Buffer.from("DukaPilot test\n", "ascii"), 0x1d, 0x56, 0x00]);
    default: return Buffer.alloc(0);
  }
}

module.exports = { asProtocol, validatePayload, testPayload };
