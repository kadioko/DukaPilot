const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const path = require("node:path");

const { isSmsConfigured, sendSms, smsProvider } = require("../src/services/otp.service");
const prismaPath = path.resolve(__dirname, "../src/lib/prisma.js");
const otpPath = path.resolve(__dirname, "../src/services/otp.service.js");
const authPath = path.resolve(__dirname, "../src/controllers/auth.controller.js");

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

test("NextSMS requires an API key and the approved sender ID", () => {
  const previous = Object.fromEntries(["SMS_PROVIDER", "NEXTSMS_API_KEY", "NEXTSMS_SENDER_ID"].map((name) => [name, process.env[name]]));
  try {
    process.env.SMS_PROVIDER = "NEXTSMS";
    delete process.env.NEXTSMS_API_KEY;
    delete process.env.NEXTSMS_SENDER_ID;
    assert.equal(smsProvider(), "NEXTSMS");
    assert.equal(isSmsConfigured(), false);
    process.env.NEXTSMS_API_KEY = "configured";
    assert.equal(isSmsConfigured(), false);
    process.env.NEXTSMS_SENDER_ID = "DukaPilot";
    assert.equal(isSmsConfigured(), true);
  } finally {
    Object.entries(previous).forEach(([name, value]) => restore(name, value));
  }
});

test("NextSMS sends the approved sender, Tanzania digits, and a bearer token", async () => {
  const previousFetch = global.fetch;
  const previous = Object.fromEntries(["SMS_PROVIDER", "NEXTSMS_API_KEY", "NEXTSMS_SENDER_ID"].map((name) => [name, process.env[name]]));
  let request;
  try {
    process.env.SMS_PROVIDER = "NEXTSMS";
    process.env.NEXTSMS_API_KEY = "secret-key";
    process.env.NEXTSMS_SENDER_ID = "DukaPilot";
    global.fetch = async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ messages: [{ messageId: "message-1", status: { groupName: "PENDING", name: "ENROUTE (SENT)" } }] }), { status: 200 });
    };

    const result = await sendSms("+255 743 910 580", "Reset code 123456");
    const payload = JSON.parse(request.options.body);

    assert.equal(result.sent, true);
    assert.equal(result.provider, "NEXTSMS");
    assert.equal(request.url, "https://messaging-service.co.tz/api/sms/v2/text/single");
    assert.equal(request.options.headers.Authorization, "Bearer secret-key");
    assert.equal(payload.from, "DukaPilot");
    assert.equal(payload.to, "255743910580");
    assert.equal(payload.text, "Reset code 123456");
    assert.equal(payload.flash, 0);
    assert.match(payload.reference, /^otp-[a-f0-9]{20}$/);
  } finally {
    global.fetch = previousFetch;
    Object.entries(previous).forEach(([name, value]) => restore(name, value));
  }
});

test("Africa's Talking remains an explicit legacy fallback", () => {
  const previous = Object.fromEntries(["SMS_PROVIDER", "AT_API_KEY", "AT_USERNAME"].map((name) => [name, process.env[name]]));
  try {
    process.env.SMS_PROVIDER = "AFRICASTALKING";
    delete process.env.AT_API_KEY;
    process.env.AT_USERNAME = "sandbox";
    assert.equal(isSmsConfigured(), false);
    process.env.AT_API_KEY = "configured";
    assert.equal(isSmsConfigured(), false);
    process.env.AT_USERNAME = "dukapilot";
    assert.equal(isSmsConfigured(), true);
  } finally {
    Object.entries(previous).forEach(([name, value]) => restore(name, value));
  }
});

test("an active staff member can reset their own PIN with a verified SMS code", async () => {
  let updated;
  const prismaMock = {
    user: { findFirst: async () => null },
    staffMember: {
      findFirst: async () => ({ id: "staff-1", isActive: true, phone: "+255743910580" }),
      update: async ({ data }) => { updated = data; },
    },
  };
  const originalPrisma = require.cache[prismaPath];
  const originalOtp = require.cache[otpPath];
  try {
    require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: prismaMock };
    require.cache[otpPath] = { id: otpPath, filename: otpPath, loaded: true, exports: { verifyOtp: () => true, isSmsConfigured: () => true, issueOtp: async () => ({ sent: true }) } };
    delete require.cache[authPath];
    const controller = require(authPath);
    const res = { statusCode: 200, payload: null, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } };
    const req = { body: { phone: "0743 910 580", code: "123456", newPin: "5678" } };

    await controller.verifyOtpAndResetPin(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(await bcrypt.compare("5678", updated.pin), true);
    assert.equal(req.audit.resourceType, "staff");
    assert.equal(req.audit.resourceId, "staff-1");
  } finally {
    if (originalPrisma) require.cache[prismaPath] = originalPrisma; else delete require.cache[prismaPath];
    if (originalOtp) require.cache[otpPath] = originalOtp; else delete require.cache[otpPath];
    delete require.cache[authPath];
  }
});
