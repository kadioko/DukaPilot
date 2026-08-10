/**
 * OTP SMS delivery for PIN recovery.
 *
 * Production uses NextSMS. Africa's Talking remains a local/legacy fallback
 * while deployments move their SMS secrets to the NextSMS variables.
 */

const { randomUUID } = require("crypto");

const OTP_TTL_MS = 10 * 60 * 1000;
const NEXTSMS_DEFAULT_URL = "https://messaging-service.co.tz/api/sms/v2/text/single";

// In-memory OTP store: phone -> { code, expiresAt, attempts }
// A production multi-instance deployment should move this to Redis.
const otpStore = new Map();

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function cleanExpired() {
  const now = Date.now();
  for (const [phone, entry] of otpStore.entries()) {
    if (entry.expiresAt < now) otpStore.delete(phone);
  }
}

function smsProvider() {
  const configured = String(process.env.SMS_PROVIDER || "").trim().toUpperCase();
  if (configured === "NEXTSMS" || configured === "AFRICASTALKING") return configured;
  return process.env.NEXTSMS_API_KEY ? "NEXTSMS" : "AFRICASTALKING";
}

function nextSmsPhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

async function sendNextSms(phone, message) {
  const apiKey = String(process.env.NEXTSMS_API_KEY || "").trim();
  const senderId = String(process.env.NEXTSMS_SENDER_ID || "").trim();
  if (!apiKey || !senderId) {
    throw new Error("NextSMS is not configured. Set NEXTSMS_API_KEY and NEXTSMS_SENDER_ID.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const reference = `otp-${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  try {
    const response = await fetch(process.env.NEXTSMS_API_URL || NEXTSMS_DEFAULT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ from: senderId, to: nextSmsPhone(phone), text: message, flash: 0, reference }),
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    if (!response.ok) throw new Error(`NextSMS API error (${response.status}): ${text.slice(0, 300)}`);

    const recipient = data.messages?.[0];
    const group = String(recipient?.status?.groupName || "").toUpperCase();
    if (!recipient || ["FAILED", "REJECTED"].includes(group)) {
      throw new Error(`NextSMS delivery failed: ${recipient?.status?.name || group || "unknown"}`);
    }
    return { sent: true, messageId: recipient.messageId || null, reference, provider: "NEXTSMS" };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendAfricasTalking(phone, message) {
  const apiKey = process.env.AT_API_KEY;
  const username = process.env.AT_USERNAME || "sandbox";
  const senderId = process.env.AT_SENDER_ID || "";
  const normalizedPhone = phone.startsWith("+") ? phone : `+${phone.replace(/\D/g, "")}`;
  const body = new URLSearchParams({ username, to: normalizedPhone, message });
  if (senderId) body.set("from", senderId);

  const host = username === "sandbox" ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com";
  const response = await fetch(`${host}/version1/messaging`, {
    method: "POST",
    headers: { Accept: "application/json", apiKey, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) throw new Error(`Africa's Talking API error: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  const recipient = data.SMSMessageData?.Recipients?.[0];
  if (recipient?.status !== "Success") throw new Error(`SMS delivery failed: ${recipient?.status || "unknown"}`);
  return { sent: true, messageId: recipient.messageId, provider: "AFRICASTALKING" };
}

async function sendSms(phone, message) {
  const provider = smsProvider();
  if (!isSmsConfigured()) {
    console.log(`[OTP DEV] SMS to ${phone}: ${message}`);
    return { sent: false, reason: `${provider} is not configured - OTP logged to console` };
  }
  return provider === "NEXTSMS" ? sendNextSms(phone, message) : sendAfricasTalking(phone, message);
}

async function issueOtp(phone) {
  cleanExpired();
  const code = generateCode();
  const message = `DukaPilot: PIN reset code ${code}. Expires in 10 minutes. Do not share this code.`;
  const result = await sendSms(phone, message);
  if (result.sent) otpStore.set(phone, { code, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  return result;
}

function isSmsConfigured() {
  if (smsProvider() === "NEXTSMS") {
    return Boolean(process.env.NEXTSMS_API_KEY && process.env.NEXTSMS_SENDER_ID);
  }
  return Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME && process.env.AT_USERNAME !== "sandbox");
}

function verifyOtp(phone, code) {
  cleanExpired();
  const entry = otpStore.get(phone);
  if (!entry) throw Object.assign(new Error("OTP expired or not found. Request a new code."), { status: 400 });

  entry.attempts += 1;
  if (entry.attempts > 5) {
    otpStore.delete(phone);
    throw Object.assign(new Error("Too many incorrect attempts. Request a new code."), { status: 429 });
  }
  if (entry.code !== String(code).trim()) throw Object.assign(new Error("Incorrect OTP code"), { status: 400 });

  otpStore.delete(phone);
  return true;
}

module.exports = { issueOtp, verifyOtp, isSmsConfigured, sendSms, smsProvider };
