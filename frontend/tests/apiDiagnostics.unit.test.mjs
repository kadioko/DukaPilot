import assert from "node:assert/strict";
import test from "node:test";
import { diagnosticEndpoint } from "../src/lib/apiDiagnostics.ts";
import { apiRetryDelayMs, shouldRetryApiFailure } from "../src/lib/apiRetry.ts";

test("API diagnostics omit opaque resource IDs and query parameters", () => {
  assert.equal(diagnosticEndpoint("/cash-sessions/cmvf16wib00bp01mz3k269f0d/close?token=secret"), "/cash-sessions/:id/close");
  assert.equal(diagnosticEndpoint("/products/cmv4v5ju101l901s0q7bji8kf"), "/products/:id");
  assert.equal(diagnosticEndpoint("/dashboard?period=today"), "/dashboard");
  assert.equal(diagnosticEndpoint("/sync/events"), "/sync/events");
});

test("API retries are bounded and give fast network failures one extra recovery attempt", () => {
  assert.equal(shouldRetryApiFailure({ failureType: "NETWORK" }, 1, true), true);
  assert.equal(shouldRetryApiFailure({ failureType: "NETWORK" }, 2, true), true);
  assert.equal(shouldRetryApiFailure({ failureType: "NETWORK" }, 3, true), false);
  assert.equal(shouldRetryApiFailure({ failureType: "TIMEOUT" }, 1, true), true);
  assert.equal(shouldRetryApiFailure({ failureType: "TIMEOUT" }, 2, true), false);
  assert.equal(shouldRetryApiFailure({ failureType: "HTTP", status: 503 }, 1, false), false);
  assert.equal(shouldRetryApiFailure({ failureType: "HTTP", status: 503 }, 1, true), true);
  assert.equal(shouldRetryApiFailure({ failureType: "INVALID_RESPONSE" }, 1, true), true);
  assert.equal(shouldRetryApiFailure({ failureType: "INVALID_RESPONSE" }, 1, false), false);
  assert.equal(apiRetryDelayMs(1, "NETWORK"), 350);
  assert.equal(apiRetryDelayMs(2, "NETWORK"), 900);
  assert.equal(apiRetryDelayMs(2, "TIMEOUT"), 350);
});
