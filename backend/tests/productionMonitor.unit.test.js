const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const monitor = path.resolve(__dirname, "../scripts/production-monitor.js");
const fixture = `
global.fetch = async (url, options = {}) => {
  const target = new URL(url);
  const proxy = target.hostname === "frontend.test" && target.pathname.startsWith("/_api/");
  const endpoint = target.pathname.startsWith("/_api/") ? "/api" + target.pathname.slice(5) : target.pathname;
  let status = 200;
  let body = {};
  const headers = { "content-type": "application/json" };
  if (target.pathname === "/") return new Response("DukaPilot", { status: 200 });
  if (target.pathname === "/catalog") return new Response("catalog", { status: 200 });
  if (target.pathname === "/health") body = { status: "ok", service: "DukaPilot API" };
  if (endpoint === "/api/public/products") body = { products: [] };
  if (options.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "https://frontend.test", "access-control-allow-headers": "content-type,x-request-id" } });
  if (endpoint === "/api/auth/login") {
    if (proxy && process.env.TEST_PROXY_FAILURE === "1") return new Response("{}", { status: 502, headers });
    headers["set-cookie"] = "dukapilot_token=mock; Path=/; HttpOnly; Secure";
    if (options.headers["X-Request-ID"]) headers["x-request-id"] = options.headers["X-Request-ID"];
  }
  if (endpoint === "/api/dashboard") body = { summary: {} };
  if (endpoint === "/api/auth/me") {
    if (options.headers.Authorization) {
      status = 401;
      body = { error: "unauthorized" };
      headers["x-request-id"] = options.headers["X-Request-ID"];
    } else {
      if (!options.headers.Cookie?.includes("dukapilot_token=mock")) throw new Error("missing session cookie");
      body = { user: { role: "MERCHANT" } };
    }
  }
  return new Response(JSON.stringify(body), { status, headers });
};
require(${JSON.stringify(monitor)});
`;

function runMonitor(proxyFailure) {
  return spawnSync(process.execPath, ["-e", fixture], {
    encoding: "utf8",
    env: {
      ...process.env,
      MONITOR_FRONTEND_URL: "https://frontend.test",
      MONITOR_API_URL: "https://api.test",
      MONITOR_LOGIN_PHONE: "test",
      MONITOR_LOGIN_PIN: "test",
      TEST_PROXY_FAILURE: proxyFailure ? "1" : "0",
    },
  });
}

test("production monitor checks proxy login and authenticated session", () => {
  const result = runMonitor(false);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /OK same-origin proxy login/);
  assert.match(result.stdout, /OK same-origin proxy authenticated session/);
});

test("production monitor reports an unavailable login proxy", () => {
  const result = runMonitor(true);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /FAIL same-origin proxy login: proxy login expected 2xx, got 502/);
  assert.match(result.stderr, /FAIL same-origin proxy authenticated session/);
});
