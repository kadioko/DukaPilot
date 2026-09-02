const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const servicePath = path.resolve(__dirname, "../src/services/whatsapp.service.js");

function restoreEnvironment(previous) {
  Object.entries(previous).forEach(([name, value]) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  });
}

test("WhatsApp PIN recovery sends an approved template to normalized Tanzania digits", async () => {
  const previousFetch = global.fetch;
  const names = ["WHATSAPP_API_URL", "WHATSAPP_API_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_OTP_TEMPLATE", "WHATSAPP_OTP_TEMPLATE_LANGUAGE"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  let request;

  try {
    process.env.WHATSAPP_API_URL = "https://graph.facebook.com/v23.0/";
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_ID = "phone-id";
    process.env.WHATSAPP_OTP_TEMPLATE = "dukapilot_pin_reset";
    process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE = "en_US";
    global.fetch = async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), { status: 200 });
    };

    delete require.cache[servicePath];
    const { sendWhatsAppOtp, isWhatsAppOtpConfigured, normalizeWhatsAppPhone } = require(servicePath);
    const result = await sendWhatsAppOtp("0713 712 057", "123456");
    const payload = JSON.parse(request.options.body);

    assert.equal(isWhatsAppOtpConfigured(), true);
    assert.equal(normalizeWhatsAppPhone("0713 712 057"), "255713712057");
    assert.equal(request.url, "https://graph.facebook.com/v23.0/phone-id/messages");
    assert.equal(request.options.headers.Authorization, "Bearer test-token");
    assert.equal(payload.to, "255713712057");
    assert.equal(payload.type, "template");
    assert.equal(payload.template.name, "dukapilot_pin_reset");
    assert.equal(payload.template.language.code, "en_US");
    assert.equal(payload.template.components[0].parameters[0].text, "123456");
    assert.equal(result.messageId, "wamid.test");
  } finally {
    global.fetch = previousFetch;
    restoreEnvironment(previous);
    delete require.cache[servicePath];
  }
});

test("WhatsApp PIN recovery is disabled until a template is configured", () => {
  const names = ["WHATSAPP_API_URL", "WHATSAPP_API_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_OTP_TEMPLATE"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.WHATSAPP_API_URL = "https://graph.facebook.com/v23.0";
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_ID = "phone-id";
    delete process.env.WHATSAPP_OTP_TEMPLATE;
    delete require.cache[servicePath];
    const { isWhatsAppOtpConfigured } = require(servicePath);
    assert.equal(isWhatsAppOtpConfigured(), false);
  } finally {
    restoreEnvironment(previous);
    delete require.cache[servicePath];
  }
});

test("free-form Cloud API messages stay disabled until explicitly enabled", async () => {
  const names = ["WHATSAPP_API_URL", "WHATSAPP_API_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_ENABLE_FREEFORM"];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.WHATSAPP_API_URL = "https://graph.facebook.com/v23.0";
    process.env.WHATSAPP_API_TOKEN = "test-token";
    process.env.WHATSAPP_PHONE_ID = "phone-id";
    process.env.WHATSAPP_ENABLE_FREEFORM = "false";
    delete require.cache[servicePath];
    const { sendWhatsAppMessage } = require(servicePath);
    const result = await sendWhatsAppMessage("0713712057", "Order notification");
    assert.deepEqual(result, { sent: false, reason: "WhatsApp free-form messaging is disabled" });
  } finally {
    restoreEnvironment(previous);
    delete require.cache[servicePath];
  }
});
