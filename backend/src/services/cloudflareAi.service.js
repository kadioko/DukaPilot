const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const TIMEOUT_MS = 10000;

// This client is not connected to a route. Merchant data must not be sent until
// consent, privacy, and shared usage controls have been implemented.
async function testConnection({ accountId, apiToken, fetchImpl = globalThis.fetch } = {}) {
  if (!/^[a-f0-9]{32}$/i.test(accountId || "") || !apiToken || typeof fetchImpl !== "function") {
    return { ok: false, reason: "NOT_CONFIGURED" };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Reply with exactly: Connection works." }], max_tokens: 20 }),
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) return { ok: false, reason: response.status === 429 ? "LIMITED" : "PROVIDER_ERROR" };
    const result = await response.json();
    if (result?.success !== true || typeof result?.result?.response !== "string" || !result.result.response.trim()) return { ok: false, reason: "INVALID_RESPONSE" };
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: controller.signal.aborted ? "TIMEOUT" : "UNAVAILABLE" };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { testConnection };
