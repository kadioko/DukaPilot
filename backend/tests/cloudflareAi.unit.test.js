const test = require("node:test");
const assert = require("node:assert/strict");
const { testConnection } = require("../src/services/cloudflareAi.service");

const accountId = "0123456789abcdef0123456789abcdef";
const apiToken = "test-token";

test("Cloudflare connection test sends only a synthetic prompt to the fixed endpoint", async () => {
  let request;
  const result = await testConnection({ accountId, apiToken, fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ success: true, result: { response: "Connection works." } }) };
  } });
  assert.deepEqual(result, { ok: true });
  assert.equal(request.url, `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`);
  assert.equal(request.options.redirect, "error");
  assert.deepEqual(JSON.parse(request.options.body), { messages: [{ role: "user", content: "Reply with exactly: Connection works." }], max_tokens: 20 });
  assert.ok(!JSON.stringify(result).includes(apiToken));
});

test("Cloudflare connection test is disabled without valid configuration", async () => {
  let called = false;
  const result = await testConnection({ accountId: "bad/account", apiToken, fetchImpl: async () => { called = true; } });
  assert.deepEqual(result, { ok: false, reason: "NOT_CONFIGURED" });
  assert.equal(called, false);
});

test("Cloudflare failures do not expose provider responses or tokens", async () => {
  assert.deepEqual(await testConnection({ accountId, apiToken, fetchImpl: async () => ({ ok: false, status: 429 }) }), { ok: false, reason: "LIMITED" });
  assert.deepEqual(await testConnection({ accountId, apiToken, fetchImpl: async () => { throw new Error(`secret ${apiToken}`); } }), { ok: false, reason: "UNAVAILABLE" });
  assert.deepEqual(await testConnection({ accountId, apiToken, fetchImpl: async () => ({ ok: true, json: async () => ({ success: true, result: {} }) }) }), { ok: false, reason: "INVALID_RESPONSE" });
});
