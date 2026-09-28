const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const PROTOCOLS = new Set(["TSPL", "ZPL", "EPL", "ESCPOS"]);

function integer(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function readConfig(env = process.env) {
  const host = String(env.BRIDGE_HOST || "127.0.0.1").trim();
  if (!LOOPBACK_HOSTS.has(host)) throw new Error("BRIDGE_HOST must be localhost, 127.0.0.1, or ::1");
  const protocol = String(env.PRINTER_PROTOCOL || "TSPL").trim().toUpperCase();
  if (!PROTOCOLS.has(protocol)) throw new Error("PRINTER_PROTOCOL must be TSPL, ZPL, EPL, or ESCPOS");
  const connection = String(env.PRINTER_CONNECTION || "NETWORK").trim().toUpperCase();
  if (connection !== "NETWORK") throw new Error("Only NETWORK printer connections are currently implemented by the bridge");
  const printerHost = String(env.PRINTER_LAN_IP || "").trim();
  if (!printerHost) throw new Error("PRINTER_LAN_IP is required for NETWORK printing");
  const origins = String(env.BRIDGE_ALLOWED_ORIGINS || "https://www.dukapilot.com,https://dukapilot.com,http://localhost:3000")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
  return {
    host,
    port: integer(env.BRIDGE_PORT, 9123, 1, 65535),
    token: String(env.BRIDGE_TOKEN || ""),
    allowedOrigins: new Set(origins),
    maxPayloadBytes: integer(env.BRIDGE_MAX_PAYLOAD_BYTES, 524288, 1024, 1048576),
    printer: {
      id: String(env.PRINTER_ID || "default").trim() || "default",
      name: String(env.PRINTER_NAME || "DukaPilot network printer").trim(),
      protocol,
      connection,
      host: printerHost,
      port: integer(env.PRINTER_TCP_PORT, 9100, 1, 65535),
      timeoutMs: integer(env.PRINTER_TIMEOUT_MS, 10000, 1000, 60000),
    },
  };
}

module.exports = { PROTOCOLS, readConfig };
