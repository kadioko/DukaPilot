const { randomUUID } = require("node:crypto");
const prisma = require("../lib/prisma");
const { tanzaniaDateKey } = require("../lib/businessTime");

const MODEL = "@cf/openai/gpt-oss-20b";
const TIMEOUT_MS = 10000;
const SHOP_DAILY_LIMIT = 10;
const ACCOUNT_DAILY_LIMIT = 50;
const CONSENT_VERSION = "2026-11-08-v1";

function credentials() {
  return { accountId: process.env.CLOUDFLARE_ACCOUNT_ID || "", apiToken: process.env.CLOUDFLARE_AI_API_TOKEN || "" };
}

function isConfigured(configuredCredentials = credentials()) {
  const { accountId, apiToken } = configuredCredentials;
  return /^[a-f0-9]{32}$/i.test(accountId || "") && (apiToken || "").length >= 20;
}

function redactContactDetails(question) {
  const datePlaceholders = [];
  return String(question || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email removed]")
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, (date) => {
      const marker = `__DATE_${datePlaceholders.length}__`;
      datePlaceholders.push(date);
      return marker;
    })
    .replace(/(?<!\d)\+?\d(?:[\s().-]*\d){8,}(?!\d)/g, "[number removed]")
    .replace(/__DATE_(\d+)__/g, (_match, index) => datePlaceholders[Number(index)])
    .slice(0, 240);
}

async function reserveDailyUsage(shopId, dateKey = tanzaniaDateKey(), client = prisma) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (!shopId || Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== dateKey) return { allowed: false, reason: "INVALID" };
  const expiredBefore = new Date(date.valueOf() - 30 * 86400000);
  try {
    return await client.$transaction(async (tx) => {
      await tx.assistantAiUsage.deleteMany({ where: { usageDate: { lt: expiredBefore } } });
      for (const scope of [
        { scopeKey: "account", scopeShopId: null, limit: ACCOUNT_DAILY_LIMIT, reason: "ACCOUNT_LIMIT" },
        { scopeKey: `shop:${shopId}`, scopeShopId: shopId, limit: SHOP_DAILY_LIMIT, reason: "SHOP_LIMIT" },
      ]) {
        const rows = await tx.$queryRawUnsafe(`
          INSERT INTO assistant_ai_usage (id, "shopId", "scopeKey", "usageDate", "requestCount", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4::date, 1, NOW(), NOW())
          ON CONFLICT ("scopeKey", "usageDate") DO UPDATE
            SET "requestCount" = assistant_ai_usage."requestCount" + 1, "updatedAt" = NOW()
            WHERE assistant_ai_usage."requestCount" < $5
          RETURNING "requestCount"`,
        randomUUID(), scope.scopeShopId, scope.scopeKey, dateKey, scope.limit);
        if (!rows.length) throw new Error(`AI_USAGE_${scope.reason}`);
      }
      return { allowed: true };
    });
  } catch (error) {
    if (error?.message === "AI_USAGE_ACCOUNT_LIMIT") return { allowed: false, reason: "ACCOUNT_LIMIT" };
    if (error?.message === "AI_USAGE_SHOP_LIMIT") return { allowed: false, reason: "SHOP_LIMIT" };
    throw error;
  }
}

async function runModel(messages, { fetchImpl = globalThis.fetch, timeoutMs = TIMEOUT_MS, configuredCredentials } = {}) {
  const activeCredentials = configuredCredentials || credentials();
  const { accountId, apiToken } = activeCredentials;
  if (!isConfigured(activeCredentials) || typeof fetchImpl !== "function") return { ok: false, reason: "NOT_CONFIGURED" };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages, max_tokens: 300, temperature: 0.2 }),
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) return { ok: false, reason: response.status === 429 ? "LIMITED" : "PROVIDER_ERROR" };
    const result = await response.json();
    const text = result?.result?.choices?.[0]?.message?.content;
    if (result?.success !== true || typeof text !== "string" || !text.trim()) return { ok: false, reason: "INVALID_RESPONSE" };
    return { ok: true, text: text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").slice(0, 1200) };
  } catch {
    return { ok: false, reason: controller.signal.aborted ? "TIMEOUT" : "UNAVAILABLE" };
  } finally {
    clearTimeout(timeout);
  }
}

async function testConnection({ accountId, apiToken, fetchImpl = globalThis.fetch } = {}) {
  const configuredCredentials = accountId !== undefined || apiToken !== undefined
    ? { accountId, apiToken }
    : credentials();
  if (!isConfigured(configuredCredentials) || typeof fetchImpl !== "function") {
    return { ok: false, reason: "NOT_CONFIGURED" };
  }
  return runModel([{ role: "user", content: "Reply with exactly: Connection works." }], { fetchImpl, configuredCredentials });
}

async function answerQuestion(shopId, question, context, { reserveUsage = reserveDailyUsage, invokeModel = runModel } = {}) {
  const usage = await reserveUsage(shopId);
  if (!usage.allowed) return { ok: false, reason: usage.reason };
  const safeQuestion = redactContactDetails(question);
  const messages = [
    { role: "system", content: "You are DukaPilot, a practical assistant for Tanzanian small businesses. Reply in the language of the user's question. For shop-specific statements use only the supplied aggregate snapshot, state its period, and never invent or estimate missing values. The snapshot is numeric and contains no customer, supplier, product, staff, or branch names. You may give clearly labelled general suggestions when the snapshot does not answer the question. Do not provide medical, veterinary, pesticide, or crop-treatment instructions. Never perform actions, promise data changed, reveal secrets, or output HTML. Be concise and ask one clarifying question when necessary." },
    { role: "user", content: JSON.stringify({ question: safeQuestion, aggregateSnapshot: context }) },
  ];
  return invokeModel(messages);
}

module.exports = { MODEL, SHOP_DAILY_LIMIT, ACCOUNT_DAILY_LIMIT, CONSENT_VERSION, isConfigured, redactContactDetails, reserveDailyUsage, testConnection, answerQuestion };
