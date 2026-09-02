/**
 * OTP SMS delivery for PIN recovery.
 *
 * Production uses NextSMS. Africa's Talking remains a local/legacy fallback
 * while deployments move their SMS secrets to the NextSMS variables.
 */

const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");
const prisma = require("../lib/prisma");
const { sendWhatsAppOtp, isWhatsAppOtpConfigured } = require("./whatsapp.service");

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const NEXTSMS_DEFAULT_URL = "https://messaging-service.co.tz/api/sms/v2/text/single";

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
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

function normalizeDeliveryChannel(channel) {
  const value = String(channel || "SMS").trim().toUpperCase();
  return ["SMS", "WHATSAPP"].includes(value) ? value : null;
}

function isOtpChannelConfigured(channel) {
  const normalized = normalizeDeliveryChannel(channel);
  return normalized === "WHATSAPP" ? isWhatsAppOtpConfigured() : normalized === "SMS" ? isSmsConfigured() : false;
}

async function issueOtp(phone, channel = "SMS") {
  const deliveryChannel = normalizeDeliveryChannel(channel);
  if (!deliveryChannel) throw Object.assign(new Error("Choose SMS or WhatsApp for PIN recovery."), { status: 400 });
  if (!isOtpChannelConfigured(deliveryChannel)) {
    throw new Error(`${deliveryChannel === "WHATSAPP" ? "WhatsApp" : "SMS"} PIN recovery is not configured.`);
  }
  const now = new Date();
  const resendAfter = new Date(now.getTime() - OTP_RESEND_COOLDOWN_MS);
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  // Reserve the send before contacting the SMS provider. This survives
  // restarts and stops two API instances from charging for the same reset.
  const updated = await prisma.pinResetOtp.updateMany({
    where: { phone, lastSentAt: { lte: resendAfter } },
    data: { codeHash, expiresAt, attempts: 0, lastSentAt: now },
  });
  if (updated.count !== 1) {
    try {
      await prisma.pinResetOtp.create({ data: { phone, codeHash, expiresAt, attempts: 0, lastSentAt: now } });
    } catch (error) {
      if (error.code === "P2002") {
        throw Object.assign(new Error("Please wait one minute before requesting another code."), { status: 429 });
      }
      throw error;
    }
  }

  try {
    const result = deliveryChannel === "WHATSAPP"
      ? await sendWhatsAppOtp(phone, code)
      : await sendSms(phone, `DukaPilot: PIN reset code ${code}. Expires in 10 minutes. Do not share this code.`);
    if (!result.sent) await prisma.pinResetOtp.deleteMany({ where: { phone, codeHash } });
    return { ...result, channel: deliveryChannel };
  } catch (error) {
    await prisma.pinResetOtp.deleteMany({ where: { phone, codeHash } });
    throw error;
  }
}

function isSmsConfigured() {
  if (smsProvider() === "NEXTSMS") {
    return Boolean(process.env.NEXTSMS_API_KEY && process.env.NEXTSMS_SENDER_ID);
  }
  return Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME && process.env.AT_USERNAME !== "sandbox");
}

async function verifyOtp(phone, code) {
  const entry = await prisma.pinResetOtp.findUnique({ where: { phone } });
  if (!entry) throw Object.assign(new Error("OTP expired or not found. Request a new code."), { status: 400 });
  if (entry.expiresAt <= new Date()) {
    await prisma.pinResetOtp.deleteMany({ where: { phone } });
    throw Object.assign(new Error("OTP expired or not found. Request a new code."), { status: 400 });
  }
  if (entry.attempts >= OTP_MAX_ATTEMPTS) {
    await prisma.pinResetOtp.deleteMany({ where: { phone } });
    throw Object.assign(new Error("Too many incorrect attempts. Request a new code."), { status: 429 });
  }
  const matches = await bcrypt.compare(String(code).trim(), entry.codeHash);
  if (!matches) {
    const nextAttempts = entry.attempts + 1;
    await prisma.pinResetOtp.updateMany({ where: { phone, attempts: entry.attempts }, data: { attempts: { increment: 1 } } });
    if (nextAttempts >= OTP_MAX_ATTEMPTS) {
      await prisma.pinResetOtp.deleteMany({ where: { phone } });
      throw Object.assign(new Error("Too many incorrect attempts. Request a new code."), { status: 429 });
    }
    throw Object.assign(new Error("Incorrect OTP code"), { status: 400 });
  }

  await prisma.pinResetOtp.deleteMany({ where: { phone, codeHash: entry.codeHash } });
  return true;
}

module.exports = {
  issueOtp,
  verifyOtp,
  isSmsConfigured,
  isOtpChannelConfigured,
  normalizeDeliveryChannel,
  sendSms,
  smsProvider,
};
