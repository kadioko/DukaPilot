const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const servicePath = path.resolve(__dirname, "../src/services/meta-whatsapp-coexistence.service.js");

function restoreEnvironment(previous) {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test("coexistence verification only accepts a Business App Cloud API phone", async () => {
  const previousFetch = global.fetch;
  const names = ["META_APP_ID", "META_APP_SECRET", "META_GRAPH_API_URL"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.META_APP_ID = "app-id";
    process.env.META_APP_SECRET = "app-secret";
    process.env.META_GRAPH_API_URL = "https://graph.facebook.com/v25.0";
    global.fetch = async (url) => {
      if (String(url).includes("oauth/access_token")) {
        return new Response(JSON.stringify({ access_token: "short-lived-meta-token" }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [
        { id: "old-phone", is_on_biz_app: false, platform_type: "CLOUD_API" },
        { id: "cloud-phone", display_phone_number: "+255 743 910 580", verified_name: "DukaPilot", is_on_biz_app: true, platform_type: "CLOUD_API" },
      ] }), { status: 200 });
    };
    delete require.cache[servicePath];
    const { verifyCoexistenceOnboarding } = require(servicePath);
    const result = await verifyCoexistenceOnboarding({ code: "authorization-code-123", wabaId: "464282675359858" });
    assert.equal(result.connected, true);
    assert.equal(result.phoneNumberId, "cloud-phone");
    assert.equal(result.isOnBusinessApp, true);
    assert.equal(result.platformType, "CLOUD_API");
    assert.equal(JSON.stringify(result).includes("short-lived-meta-token"), false);
  } finally {
    global.fetch = previousFetch;
    restoreEnvironment(previous);
    delete require.cache[servicePath];
  }
});

test("coexistence verification remains incomplete when no phone is on both platforms", async () => {
  const previousFetch = global.fetch;
  const names = ["META_APP_ID", "META_APP_SECRET"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.META_APP_ID = "app-id";
    process.env.META_APP_SECRET = "app-secret";
    global.fetch = async (url) => new Response(JSON.stringify(String(url).includes("oauth/access_token")
      ? { access_token: "short-lived-meta-token" }
      : { data: [{ id: "phone", is_on_biz_app: true, platform_type: "ON_PREMISES" }] }
    ), { status: 200 });
    delete require.cache[servicePath];
    const { verifyCoexistenceOnboarding } = require(servicePath);
    const result = await verifyCoexistenceOnboarding({ code: "authorization-code-123", wabaId: "464282675359858" });
    assert.equal(result.connected, false);
  } finally {
    global.fetch = previousFetch;
    restoreEnvironment(previous);
    delete require.cache[servicePath];
  }
});
