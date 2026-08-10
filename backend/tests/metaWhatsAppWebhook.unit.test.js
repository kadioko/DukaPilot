const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const controller = require("../src/controllers/metaWhatsAppWebhook.controller");

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    type() { return this; },
    send(payload) { this.payload = payload; return this; },
    sendStatus(code) { this.statusCode = code; return this; },
  };
}

test("Meta WhatsApp webhook returns the challenge only for the configured token", () => {
  const original = process.env.META_WHATSAPP_VERIFY_TOKEN;
  process.env.META_WHATSAPP_VERIFY_TOKEN = "expected-token";
  try {
    const res = response();
    controller.verify({ query: { "hub.mode": "subscribe", "hub.verify_token": "expected-token", "hub.challenge": "challenge-123" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload, "challenge-123");
  } finally {
    if (original === undefined) delete process.env.META_WHATSAPP_VERIFY_TOKEN;
    else process.env.META_WHATSAPP_VERIFY_TOKEN = original;
  }
});

test("Meta WhatsApp webhook rejects an incorrect verification token", () => {
  process.env.META_WHATSAPP_VERIFY_TOKEN = "expected-token";
  const res = response();
  controller.verify({ query: { "hub.mode": "subscribe", "hub.verify_token": "wrong-token", "hub.challenge": "challenge-123" } }, res);
  assert.equal(res.statusCode, 403);
});

test("Meta WhatsApp webhook accepts only correctly signed callbacks", () => {
  const original = process.env.META_WHATSAPP_APP_SECRET;
  process.env.META_WHATSAPP_APP_SECRET = "app-secret";
  try {
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
    const signature = `sha256=${crypto.createHmac("sha256", "app-secret").update(rawBody).digest("hex")}`;
    const res = response();
    controller.receive({ rawBody, get: (name) => name === "x-hub-signature-256" ? signature : undefined }, res);
    assert.equal(res.statusCode, 200);
  } finally {
    if (original === undefined) delete process.env.META_WHATSAPP_APP_SECRET;
    else process.env.META_WHATSAPP_APP_SECRET = original;
  }
});
