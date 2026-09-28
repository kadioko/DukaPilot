const crypto = require("node:crypto");
const http = require("node:http");
const net = require("node:net");
const { asProtocol, testPayload, validatePayload } = require("./protocols");

function response(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function originAllowed(req, config) {
  const origin = req.headers.origin;
  return !origin || config.allowedOrigins.has(origin);
}

function setCors(req, res, config) {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.has(origin)) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "Origin");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "Authorization, Content-Type");
    // Chrome's Private Network Access preflight is expected when the HTTPS
    // DukaPilot site calls this loopback-only HTTP service.
    if (req.headers["access-control-request-private-network"] === "true") res.setHeader("access-control-allow-private-network", "true");
  }
}

function authorized(req, config) {
  if (!config.token) return true;
  const supplied = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const expected = Buffer.from(config.token);
  const candidate = Buffer.from(supplied);
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function readJson(req, maximum) {
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maximum) {
        const error = new Error("Request body is too large");
        error.status = 413; error.code = "PAYLOAD_TOO_LARGE";
        reject(error); req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { const error = new Error("Invalid JSON"); error.status = 400; error.code = "INVALID_JSON"; reject(error); }
    });
  });
}

function sendTcp(printer, data) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: printer.host, port: printer.port });
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true; clearTimeout(timer); socket.destroy();
      error ? reject(error) : resolve();
    };
    const timer = setTimeout(() => {
      const error = new Error("Printer connection timed out");
      error.code = "PRINTER_TIMEOUT"; finish(error);
    }, printer.timeoutMs);
    socket.once("error", (error) => { error.code = error.code || "PRINTER_NETWORK_ERROR"; finish(error); });
    socket.once("connect", () => socket.end(data, () => finish()));
  });
}

function publicPrinter(printer) {
  return { id: printer.id, name: printer.name, protocol: printer.protocol, connection: printer.connection, status: "configured" };
}

function createBridgeServer(config, { send = sendTcp } = {}) {
  return http.createServer(async (req, res) => {
    setCors(req, res, config);
    if (req.method === "OPTIONS") return res.writeHead(originAllowed(req, config) ? 204 : 403).end();
    if (!originAllowed(req, config)) return response(res, 403, { error: "Origin is not allowed", code: "ORIGIN_NOT_ALLOWED" });
    const path = new URL(req.url, "http://127.0.0.1").pathname;
    try {
      if (req.method === "GET" && path === "/health") return response(res, 200, { ok: true, service: "dukapilot-print-bridge", version: "1.0.0" });
      if (!authorized(req, config)) return response(res, 401, { error: "Bridge authentication is required", code: "UNAUTHORIZED" });
      if (req.method === "GET" && path === "/printers") return response(res, 200, { printers: [publicPrinter(config.printer)] });
      if (req.method !== "POST" || !["/test", "/print"].includes(path)) return response(res, 404, { error: "Not found", code: "NOT_FOUND" });
      // ESC/POS travels as hexadecimal, so its JSON body can be twice the
      // configured raw-byte limit. The small allowance covers JSON fields.
      const body = await readJson(req, (config.maxPayloadBytes * 2) + 4096);
      const printerId = String(body.printerId || "default");
      if (printerId !== config.printer.id) return response(res, 404, { error: "Configured printer was not found", code: "PRINTER_NOT_FOUND" });
      const protocol = asProtocol(body.protocol || config.printer.protocol);
      if (protocol !== config.printer.protocol) return response(res, 400, { error: `Printer is configured for ${config.printer.protocol}`, code: "PROTOCOL_MISMATCH" });
      const output = path === "/test" ? { printerId, protocol, data: testPayload(protocol) } : validatePayload(body, config.maxPayloadBytes);
      await send(config.printer, output.data);
      return response(res, 200, { ok: true, printerId, protocol, bytes: output.data.length });
    } catch (error) {
      return response(res, error.status || 502, { error: error.message || "Print request failed", code: error.code || "PRINT_FAILED" });
    }
  });
}

module.exports = { createBridgeServer, sendTcp };
