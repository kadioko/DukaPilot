const crypto = require("node:crypto");

const PRICES = Object.freeze({ BASIC: 15000, PRO: 35000 });
const UUID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const COMPLETED_DEPOSIT_STATUSES = new Set(["minted", "completed", "succeeded", "paid"]);
const FAILED_DEPOSIT_STATUSES = new Set(["failed", "rejected", "cancelled", "canceled", "expired", "reversed", "refunded"]);

function configured() {
  return process.env.NTZS_ENABLED === "true" && /^ntzs_live_/.test((process.env.NTZS_API_KEY || "").trim()) && Boolean((process.env.NTZS_WEBHOOK_SECRET || "").trim());
}

// Merchant balances use a separate, explicitly enabled provider user wallet.
// Keeping this flag independent from subscription checkout prevents a deploy
// from accidentally enabling either money flow on behalf of the other.
function merchantWalletConfigured() {
  return process.env.NTZS_MERCHANT_BALANCE_ENABLED === "true"
    && /^ntzs_live_/.test((process.env.NTZS_API_KEY || "").trim())
    && Boolean((process.env.NTZS_WEBHOOK_SECRET || "").trim())
    && UUID_PATTERN.test(String(process.env.NTZS_MERCHANT_BALANCE_USER_ID || "").trim());
}

function merchantWalletUserId() {
  const value = String(process.env.NTZS_MERCHANT_BALANCE_USER_ID || "").trim();
  if (!UUID_PATTERN.test(value)) throw Object.assign(new Error("Merchant balance wallet is not configured"), { status: 503 });
  return value;
}

async function request(path, options = {}) {
  if (!/^ntzs_live_/.test((process.env.NTZS_API_KEY || "").trim())) throw Object.assign(new Error("Live payment verification is not configured"), { status: 503 });
  const response = await fetch(`https://www.ntzs.co.tz/api/v1${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.NTZS_API_KEY.trim()}`, "Content-Type": "application/json", ...options.headers },
    signal: AbortSignal.timeout(12000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // nTZS documents both { code } and { error: "machine_code" } failure
    // shapes. Preserve the machine-readable code so money flows can decide
    // whether they must hold funds for reconciliation.
    const providerCode = body?.code || body?.error?.code || (typeof body?.error === "string" ? body.error : null);
    throw Object.assign(new Error("Payment provider unavailable"), { status: 502, providerStatus: response.status, providerCode });
  }
  return body;
}

function verifyDeposit(checkout, deposit) {
  if (deposit.id !== checkout.providerId
    || deposit.amountTzs !== checkout.amount
    || deposit.paymentMethod !== "mobile_money"
    || deposit.livemode === false
    || (deposit.userId && checkout.providerUserId && deposit.userId !== checkout.providerUserId)
    || deposit.collectToTreasury === false) {
    throw Object.assign(new Error("Payment verification mismatch. Contact support."), { status: 409 });
  }
  return isDepositCompletedStatus(deposit.status);
}

function verifyMerchantDeposit(transaction, deposit, providerUserId) {
  if (!deposit || deposit.id !== transaction.providerId
    || deposit.amountTzs !== transaction.amountTzs
    || deposit.paymentMethod !== "mobile_money"
    || deposit.livemode === false
    || (deposit.userId && deposit.userId !== providerUserId)) {
    throw Object.assign(new Error("Merchant deposit verification mismatch. Contact support."), { status: 409 });
  }
  return isDepositCompletedStatus(deposit.status);
}

function depositStatus(value) {
  return String(value || "").trim().toLowerCase();
}

function isDepositCompletedStatus(value) {
  return COMPLETED_DEPOSIT_STATUSES.has(depositStatus(value));
}

function isDepositTerminalFailureStatus(value) {
  return FAILED_DEPOSIT_STATUSES.has(depositStatus(value));
}

function isDepositReviewStatus(value) {
  return depositStatus(value) === "review";
}

function verifySignature(rawBody, timestamp, signature, secret) {
  if (!secret || !Buffer.isBuffer(rawBody) || typeof timestamp !== "string" || !/^\d{10,13}$/.test(timestamp) || typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const time = Number(timestamp) * (timestamp.length === 10 ? 1000 : 1);
  if (Math.abs(Date.now() - time) > 5 * 60 * 1000) return false;
  const expected = crypto.createHmac("sha256", secret.trim()).update(`${timestamp}.`).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

function renewalEnd(shop, now = new Date()) {
  const end = shop.subscriptionEndsAt && shop.subscriptionEndsAt > now ? new Date(shop.subscriptionEndsAt) : new Date(now);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(Math.min(day, new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()));
  return end;
}

module.exports = {
  PRICES,
  configured,
  merchantWalletConfigured,
  merchantWalletUserId,
  request,
  verifyDeposit,
  verifyMerchantDeposit,
  isDepositCompletedStatus,
  isDepositTerminalFailureStatus,
  isDepositReviewStatus,
  verifySignature,
  renewalEnd,
};
