const assert = require("node:assert/strict");
const test = require("node:test");
const { readConfig } = require("../src/config");
const { validatePayload } = require("../src/protocols");
const { createBridgeServer } = require("../src/server");

function testConfig(token = "") {
  return readConfig({
    BRIDGE_HOST: "127.0.0.1", BRIDGE_PORT: "9123", BRIDGE_TOKEN: token,
    PRINTER_ID: "default", PRINTER_NAME: "Test printer", PRINTER_PROTOCOL: "TSPL",
    PRINTER_CONNECTION: "NETWORK", PRINTER_LAN_IP: "192.168.1.50", PRINTER_TCP_PORT: "9100",
    BRIDGE_ALLOWED_ORIGINS: "https://www.dukapilot.com",
  });
}

async function withServer(config, action) {
  const sent = [];
  const server = createBridgeServer(config, { send: async (printer, data) => { sent.push({ printer, data }); } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try { await action(`http://127.0.0.1:${address.port}`, sent); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("TSPL, ZPL, EPL, and ESC/POS payloads validate without unsafe formats", () => {
  for (const protocol of ["TSPL", "ZPL", "EPL"]) {
    assert.equal(validatePayload({ printerId: "default", protocol, data: "TEST" }, 100).data.toString(), "TEST");
  }
  assert.deepEqual(validatePayload({ printerId: "default", protocol: "ESCPOS", data: "1b40" }, 100).data, Buffer.from([0x1b, 0x40]));
  assert.throws(() => validatePayload({ printerId: "default", protocol: "PDF", data: "x" }, 100), /protocol/);
  assert.throws(() => validatePayload({ printerId: "default", protocol: "ESCPOS", data: "not-hex" }, 100), /hexadecimal/);
});

test("bridge health and printers expose no printer network address", async () => {
  await withServer(testConfig(), async (base) => {
    const health = await fetch(`${base}/health`).then((response) => response.json());
    assert.equal(health.ok, true);
    const printers = await fetch(`${base}/printers`).then((response) => response.json());
    assert.equal(printers.printers[0].id, "default");
    assert.equal("host" in printers.printers[0], false);
    const preflight = await fetch(`${base}/print`, { method: "OPTIONS", headers: { origin: "https://www.dukapilot.com", "access-control-request-private-network": "true" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-private-network"), "true");
  });
});

test("bridge rejects invalid print payloads and protocol mismatches", async () => {
  await withServer(testConfig(), async (base) => {
    const invalid = await fetch(`${base}/print`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ printerId: "default", protocol: "PDF", data: "no" }) });
    assert.equal(invalid.status, 400);
    const mismatch = await fetch(`${base}/print`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ printerId: "default", protocol: "ZPL", data: "^XA" }) });
    assert.equal(mismatch.status, 400);
  });
});

test("bridge validates optional bearer tokens and forwards a valid raw print", async () => {
  await withServer(testConfig("bridge-test-token"), async (base, sent) => {
    const denied = await fetch(`${base}/printers`);
    assert.equal(denied.status, 401);
    const response = await fetch(`${base}/print`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer bridge-test-token" }, body: JSON.stringify({ printerId: "default", protocol: "TSPL", data: "CLS\r\nPRINT 1,1\r\n" }) });
    assert.equal(response.status, 200);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].data.toString(), "CLS\r\nPRINT 1,1\r\n");
  });
});
