const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");
const { diagnosticRoute, recordRequestPhase, requestDiagnostics } = require("../src/middleware/requestDiagnostics");

function makeResponse() {
  const response = new EventEmitter();
  response.statusCode = 200;
  response.writableFinished = false;
  response.headers = {};
  response.setHeader = (name, value) => { response.headers[name] = value; };
  return response;
}

test("request diagnostics correlate allowed API requests and log only safe timing fields", () => {
  const requestId = "6a96c140-3837-4c4d-9e92-22858be82789";
  const req = { method: "POST", path: "/api/products", originalUrl: "/api/products?secret=query-value", headers: { "x-request-id": requestId } };
  const res = makeResponse();
  const originalInfo = console.info;
  const entries = [];
  console.info = (line) => entries.push(JSON.parse(line));
  try {
    requestDiagnostics(req, res, () => {});
    recordRequestPhase(req, "product.insert", 12.6);
    recordRequestPhase(req, "secret=not-a-valid-phase", 5);
    assert.equal(req.requestId, requestId);
    assert.equal(res.headers["X-Request-ID"], requestId);
    assert.equal(diagnosticRoute(req), "/api/products");
    res.writableFinished = true;
    res.emit("finish");
  } finally {
    console.info = originalInfo;
  }

  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {
    event: "api_request_timing",
    requestId,
    method: "POST",
    path: "/api/products",
    status: 200,
    durationMs: entries[0].durationMs,
    outcome: "completed",
    phases: { "product.insert": 13 },
  });
  assert.equal(JSON.stringify(entries).includes("secret=query-value"), false);
});

test("request diagnostics generate a UUID and record client disconnects for monitored routes", () => {
  const req = { method: "GET", path: "/api/auth/me", headers: { "x-request-id": "invalid" } };
  const res = makeResponse();
  const originalInfo = console.info;
  const entries = [];
  console.info = (line) => entries.push(JSON.parse(line));
  try {
    requestDiagnostics(req, res, () => {});
    res.writableFinished = false;
    res.emit("close");
  } finally {
    console.info = originalInfo;
  }

  assert.match(req.requestId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(res.headers["X-Request-ID"], req.requestId);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].path, "/api/auth/me");
  assert.equal(entries[0].outcome, "client_disconnected");
});

test("request diagnostics omit bodies, IDs, queries, and unrelated routes", () => {
  assert.equal(diagnosticRoute({ method: "GET", path: "/api/dashboard", originalUrl: "/api/dashboard?shopId=private" }), "/api/dashboard");
  assert.equal(diagnosticRoute({ method: "GET", path: "/api/products", originalUrl: "/api/products" }), null);
  assert.equal(diagnosticRoute({ method: "POST", path: "/api/products/abc", originalUrl: "/api/products/abc" }), null);
});
