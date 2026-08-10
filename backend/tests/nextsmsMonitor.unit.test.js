const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const servicePath = path.resolve(__dirname, "../src/services/nextsms-monitor.service.js");

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function loadService() {
  delete require.cache[servicePath];
  return require(servicePath);
}

test("NextSMS monitoring uses bearer-authenticated balance and report endpoints", async () => {
  const previousFetch = global.fetch;
  const previous = Object.fromEntries(["SMS_PROVIDER", "NEXTSMS_API_KEY", "NEXTSMS_MONITOR_BASE_URL"].map((name) => [name, process.env[name]]));
  const requests = [];
  try {
    process.env.SMS_PROVIDER = "NEXTSMS";
    process.env.NEXTSMS_API_KEY = "monitor-secret";
    process.env.NEXTSMS_MONITOR_BASE_URL = "https://nextsms.test/api/v2";
    global.fetch = async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/balance")) {
        return new Response(JSON.stringify({ default_balance: 128, sms_balance: 2048, display: "2,048 TZS", default: "Internet Channel" }), { status: 200 });
      }
      return new Response(JSON.stringify({
        results: [
          { messageId: "msg-1", reference: "otp-123", to: "255768899090", from: "Dukapilot", channel: "Internet SMS", smsCount: 1, delivery: "DELIVERED", sentAt: "2026-08-10 21:03:00", doneAt: "2026-08-10 21:03:57" },
          { messageId: "msg-2", to: "255700000000", status: { groupName: "PENDING" } },
        ],
      }), { status: 200 });
    };

    const { getNextSmsMonitoring, clearNextSmsMonitoringCache } = loadService();
    clearNextSmsMonitoringCache();
    const result = await getNextSmsMonitoring({ force: true });

    assert.deepEqual(requests.map((request) => request.url).sort(), ["https://nextsms.test/api/v2/balance", "https://nextsms.test/api/v2/reports"]);
    assert.ok(requests.every((request) => request.options.headers.Authorization === "Bearer monitor-secret"));
    assert.equal(result.balance.smsCredits, 128);
    assert.equal(result.balance.balanceTzs, 2048);
    assert.equal(result.summary.delivered, 1);
    assert.equal(result.summary.pending, 1);
    assert.equal(result.reports[0].to, "********9090");
    assert.equal(result.reports[0].reference, "otp-123");
  } finally {
    global.fetch = previousFetch;
    Object.entries(previous).forEach(([name, value]) => restore(name, value));
    delete require.cache[servicePath];
  }
});

test("NextSMS monitoring refuses to run without a provider key", async () => {
  const previous = Object.fromEntries(["SMS_PROVIDER", "NEXTSMS_API_KEY"].map((name) => [name, process.env[name]]));
  try {
    process.env.SMS_PROVIDER = "NEXTSMS";
    delete process.env.NEXTSMS_API_KEY;
    const { getNextSmsMonitoring } = loadService();
    await assert.rejects(getNextSmsMonitoring(), { message: "NextSMS monitoring is not configured", status: 503 });
  } finally {
    Object.entries(previous).forEach(([name, value]) => restore(name, value));
    delete require.cache[servicePath];
  }
});
