const test = require("node:test");
const assert = require("node:assert/strict");
const { testConnection, redactContactDetails, reserveDailyUsage, answerQuestion, SHOP_DAILY_LIMIT, ACCOUNT_DAILY_LIMIT } = require("../src/services/cloudflareAi.service");

const accountId = "0123456789abcdef0123456789abcdef";
const apiToken = "test-token-not-a-secret";

test("Cloudflare connection test sends only a synthetic prompt to the fixed endpoint", async () => {
  let request;
  const result = await testConnection({ accountId, apiToken, fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ success: true, result: { choices: [{ message: { content: "Connection works." } }] } }) };
  } });
  assert.deepEqual(result, { ok: true, text: "Connection works." });
  assert.equal(request.url, `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/openai/gpt-oss-20b`);
  assert.equal(request.options.redirect, "error");
  assert.deepEqual(JSON.parse(request.options.body), { messages: [{ role: "user", content: "Reply with exactly: Connection works." }], max_tokens: 300, temperature: 0.2 });
  assert.ok(!JSON.stringify(result).includes(apiToken));
});

test("Cloudflare connection test uses backend environment credentials by default", async () => {
  const previousAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const previousApiToken = process.env.CLOUDFLARE_AI_API_TOKEN;
  process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
  process.env.CLOUDFLARE_AI_API_TOKEN = apiToken;
  try {
    const result = await testConnection({ fetchImpl: async () => ({ ok: true, json: async () => ({ success: true, result: { choices: [{ message: { content: "Connection works." } }] } }) }) });
    assert.deepEqual(result, { ok: true, text: "Connection works." });
  } finally {
    if (previousAccountId === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
    else process.env.CLOUDFLARE_ACCOUNT_ID = previousAccountId;
    if (previousApiToken === undefined) delete process.env.CLOUDFLARE_AI_API_TOKEN;
    else process.env.CLOUDFLARE_AI_API_TOKEN = previousApiToken;
  }
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

test("question redaction removes email and phone but preserves a date", () => {
  const result = redactContactDetails("Sales on 2026-11-08? Call +255 712 345 678 or mail owner@example.com");
  assert.equal(result, "Sales on 2026-11-08? Call [number removed] or mail [email removed]");
});

function fakeUsageDatabase() {
  let rows = new Map();
  let pending = Promise.resolve();
  return {
    async $transaction(callback) {
      const transaction = pending.then(async () => {
        const draft = new Map([...rows.entries()].map(([key, row]) => [key, { ...row }]));
        const tx = {
          assistantAiUsage: {
            async deleteMany({ where }) {
              for (const [key, row] of draft) if (row.date < where.usageDate.lt.toISOString().slice(0, 10)) draft.delete(key);
            },
          },
          async $queryRawUnsafe(_query, _id, shopId, scopeKey, dateKey, limit) {
            const key = `${scopeKey}:${dateKey}`;
            const row = draft.get(key) || { shopId, date: dateKey, requestCount: 0 };
            if (row.requestCount >= limit) return [];
            row.requestCount += 1;
            draft.set(key, row);
            return [{ requestCount: row.requestCount }];
          },
        };
        const result = await callback(tx);
        rows = draft;
        return result;
      });
      pending = transaction.catch(() => {});
      return transaction;
    },
    count(scopeKey, dateKey) { return rows.get(`${scopeKey}:${dateKey}`)?.requestCount || 0; },
  };
}

test("daily usage reservation enforces per-shop and shared account caps atomically", async () => {
  const db = fakeUsageDatabase();
  const date = "2098-11-08";
  const shopResults = await Promise.all(Array.from({ length: SHOP_DAILY_LIMIT + 2 }, () => reserveDailyUsage("shop-a", date, db)));
  assert.equal(shopResults.filter((result) => result.allowed).length, SHOP_DAILY_LIMIT);
  assert.equal(shopResults.at(-1).reason, "SHOP_LIMIT");
  assert.equal(db.count("account", date), SHOP_DAILY_LIMIT);

  const globalDate = "2098-11-09";
  for (let index = 0; index < ACCOUNT_DAILY_LIMIT / SHOP_DAILY_LIMIT; index += 1) {
    for (let request = 0; request < SHOP_DAILY_LIMIT; request += 1) {
      assert.equal((await reserveDailyUsage(`shop-${index}`, globalDate, db)).allowed, true);
    }
  }
  const denied = await reserveDailyUsage("shop-last", globalDate, db);
  assert.deepEqual(denied, { allowed: false, reason: "ACCOUNT_LIMIT" });
  assert.equal(db.count("account", globalDate), ACCOUNT_DAILY_LIMIT);
  assert.equal(db.count("shop:shop-last", globalDate), 0);
});

test("external answer sends a minimized question and aggregate context only after quota reservation", async () => {
  let receivedMessages;
  let reservedShop;
  const result = await answerQuestion("shop-safe", "What happened on 2026-11-08? Call +255 712 345 678", { sales: { netRevenue: 25000 } }, {
    reserveUsage: async (shopId) => { reservedShop = shopId; return { allowed: true }; },
    invokeModel: async (messages) => { receivedMessages = messages; return { ok: true, text: "Sales were TZS 25,000." }; },
  });
  assert.equal(reservedShop, "shop-safe");
  assert.equal(result.text, "Sales were TZS 25,000.");
  const serialized = JSON.stringify(receivedMessages);
  assert.match(serialized, /2026-11-08/);
  assert.match(serialized, /\[number removed\]/);
  assert.doesNotMatch(serialized, /\+255 712 345 678/);
  assert.match(serialized, /netRevenue/);
});

test("external answer never calls the provider when the daily cap is reached", async () => {
  let providerCalled = false;
  const result = await answerQuestion("shop-limited", "Hello", {}, {
    reserveUsage: async () => ({ allowed: false, reason: "SHOP_LIMIT" }),
    invokeModel: async () => { providerCalled = true; return { ok: true, text: "unexpected" }; },
  });
  assert.deepEqual(result, { ok: false, reason: "SHOP_LIMIT" });
  assert.equal(providerCalled, false);
});
