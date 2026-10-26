import assert from "node:assert/strict";
import test from "node:test";
import { diagnosticEndpoint } from "../src/lib/apiDiagnostics.ts";

test("API diagnostics omit opaque resource IDs and query parameters", () => {
  assert.equal(diagnosticEndpoint("/cash-sessions/cmvf16wib00bp01mz3k269f0d/close?token=secret"), "/cash-sessions/:id/close");
  assert.equal(diagnosticEndpoint("/products/cmv4v5ju101l901s0q7bji8kf"), "/products/:id");
  assert.equal(diagnosticEndpoint("/dashboard?period=today"), "/dashboard");
  assert.equal(diagnosticEndpoint("/sync/events"), "/sync/events");
});
