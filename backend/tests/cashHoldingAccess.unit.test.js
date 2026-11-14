const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const path = require("node:path");

test("cash holding routes deny anonymous and staff users before the feature gate", async () => {
  const authPath = path.resolve(__dirname, "../src/middleware/auth.js");
  const subscriptionPath = path.resolve(__dirname, "../src/middleware/subscription.js");
  const controllerPath = path.resolve(__dirname, "../src/controllers/cashHolding.controller.js");
  const routePath = path.resolve(__dirname, "../src/routes/cashHolding.routes.js");
  const paths = [authPath, subscriptionPath, controllerPath, routePath];
  const originals = new Map(paths.map((file) => [file, require.cache[file]]));
  const flag = process.env.CASH_HOLDING_ENABLED;
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: {
    authenticate: (req, res, next) => {
      if (!req.headers["x-test-role"]) return res.status(401).json({ error: "Unauthorized" });
      req.user = { role: "MERCHANT", userId: "owner", ...(req.headers["x-test-role"] === "staff" ? { staffId: "staff", permissions: { canViewReports: true, canManageCashSessions: true } } : {}) };
      return next();
    },
    requireRole: (...roles) => (req, res, next) => roles.includes(req.user.role) ? next() : res.sendStatus(403),
  } };
  require.cache[subscriptionPath] = { id: subscriptionPath, filename: subscriptionPath, loaded: true, exports: { requireActiveSubscription: (_req, _res, next) => next() } };
  const respond = (_req, res) => res.json({ ok: true });
  require.cache[controllerPath] = { id: controllerPath, filename: controllerPath, loaded: true, exports: { current: respond, handovers: respond, count: respond, movement: respond } };
  delete require.cache[routePath];
  const app = express();
  app.use(express.json());
  app.use("/cash-holding", require(routePath));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/cash-holding`;
  try {
    process.env.CASH_HOLDING_ENABLED = "true";
    for (const [suffix, method] of [["", "GET"], ["/handovers", "GET"], ["/count", "POST"], ["/movements", "POST"]]) {
      assert.equal((await fetch(base + suffix, { method })).status, 401);
      assert.equal((await fetch(base + suffix, { method, headers: { "x-test-role": "staff" } })).status, 403);
      assert.equal((await fetch(base + suffix, { method, headers: { "x-test-role": "owner" } })).status, 200);
    }
    delete process.env.CASH_HOLDING_ENABLED;
    assert.equal((await fetch(base, { headers: { "x-test-role": "owner" } })).status, 503);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (flag === undefined) delete process.env.CASH_HOLDING_ENABLED;
    else process.env.CASH_HOLDING_ENABLED = flag;
    for (const file of paths) {
      if (originals.get(file)) require.cache[file] = originals.get(file);
      else delete require.cache[file];
    }
  }
});
