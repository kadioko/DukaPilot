const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { scrubSentryEvent } = require("../src/lib/sentryPrivacy");

test("backend Sentry events omit session cookies and request/customer data", () => {
  const event = scrubSentryEvent({
    request: {
      method: "POST",
      url: "https://api.example.com/api/products?phone=255123456789#private",
      cookies: { dukapilot_refresh: "secret-refresh" },
      headers: { cookie: "dukapilot_token=secret-access", authorization: "Bearer secret" },
      data: { customerName: "Private Customer" },
      query_string: "phone=255123456789",
    },
    user: { email: "customer@example.com" },
    extra: { paymentReference: "private-reference" },
    breadcrumbs: [{ message: "private product data" }],
    exception: { values: [{ type: "Error", value: "Database unavailable" }] },
  });
  assert.deepEqual(event.request, { method: "POST", url: "https://api.example.com/api/products" });
  assert.equal(event.user, undefined);
  assert.equal(event.extra, undefined);
  assert.equal(event.breadcrumbs, undefined);
  assert.equal(event.exception.values[0].value, "Database unavailable");
  assert.doesNotMatch(JSON.stringify(event), /secret|Private Customer|255123456789|private-reference/);
});

test("Sentry applies privacy scrubbing to errors and transactions", () => {
  const originalLoad = Module._load;
  const previousDsn = process.env.SENTRY_DSN;
  let config;
  try {
    process.env.SENTRY_DSN = "https://example.invalid/1";
    Module._load = function (request, ...args) {
      return request === "@sentry/node" ? { init: (options) => { config = options; } } : originalLoad.call(this, request, ...args);
    };
    delete require.cache[require.resolve("../src/lib/sentry")];
    require("../src/lib/sentry");
    assert.equal(config.beforeSend, scrubSentryEvent);
    assert.equal(config.beforeSendTransaction, scrubSentryEvent);
    assert.equal(config.sendDefaultPii, false);
  } finally {
    Module._load = originalLoad;
    if (previousDsn === undefined) delete process.env.SENTRY_DSN;
    else process.env.SENTRY_DSN = previousDsn;
    delete require.cache[require.resolve("../src/lib/sentry")];
  }
});
