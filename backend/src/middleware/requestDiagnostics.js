const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function diagnosticRoute(req) {
  const path = req.path || String(req.originalUrl || req.url || "").split("?", 1)[0];
  if (req.method === "GET" && path === "/api/auth/me") return path;
  if (req.method === "GET" && (path === "/api/dashboard" || path.startsWith("/api/dashboard/"))) return path;
  if (req.method === "POST" && path === "/api/products") return path;
  return null;
}

function requestDiagnostics(req, res, next) {
  const incomingId = req.headers?.["x-request-id"];
  const requestId = typeof incomingId === "string" && REQUEST_ID_PATTERN.test(incomingId)
    ? incomingId
    : crypto.randomUUID();
  req.requestId = requestId;
  req.requestPhaseTimings = {};
  res.setHeader("X-Request-ID", requestId);

  const route = diagnosticRoute(req);
  if (route) {
    const startedAt = performance.now();
    let logged = false;
    const logTiming = (outcome) => {
      if (logged) return;
      logged = true;
      console.info(JSON.stringify({
        event: "api_request_timing",
        requestId,
        method: req.method,
        path: route,
        status: res.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
        outcome,
        phases: req.requestPhaseTimings,
      }));
    };
    res.once("finish", () => logTiming("completed"));
    res.once("close", () => {
      if (!res.writableFinished) logTiming("client_disconnected");
    });
  }

  next();
}

function recordRequestPhase(req, name, milliseconds) {
  if (!req?.requestPhaseTimings || !/^[a-zA-Z0-9_.-]{1,80}$/.test(name)) return;
  const duration = Number(milliseconds);
  if (!Number.isFinite(duration) || duration < 0) return;
  req.requestPhaseTimings[name] = Math.round(duration);
}

module.exports = { requestDiagnostics, recordRequestPhase, diagnosticRoute };
