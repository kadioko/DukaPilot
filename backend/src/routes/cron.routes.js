const crypto = require("crypto");
const router = require("express").Router();
const { runQuotationReminders } = require("../services/quotationReminder.service");
const { reconcilePending } = require("../services/merchantWallet.service");
const { reconcilePendingCheckouts } = require("../controllers/subscriptionCheckout.controller");

function authorized(req, secretName) {
  const secret = process.env[secretName];
  const supplied = String(req.get("X-Cron-Secret") || req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || !supplied) return false;
  const expected = Buffer.from(secret); const received = Buffer.from(supplied);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

router.post("/quotation-reminders", async (req, res, next) => {
  if (!authorized(req, "QUOTATION_REMINDER_CRON_SECRET")) return res.status(401).json({ error: "Unauthorized cron request" });
  try { res.json(await runQuotationReminders()); } catch (error) { next(error); }
});

// nTZS sends signed deposit events, but a delayed webhook must not leave a
// wallet deposit, payout, or subscription checkout stuck. This bounded sweep
// only reads back known provider IDs; it never starts a new provider request.
router.post("/merchant-wallet-reconcile", async (req, res, next) => {
  if (!authorized(req, "MERCHANT_WALLET_RECONCILE_CRON_SECRET")) return res.status(401).json({ error: "Unauthorized cron request" });
  try {
    const merchantWallet = await reconcilePending(100);
    const subscriptions = await reconcilePendingCheckouts(100);
    res.json({ merchantWallet, subscriptions });
  } catch (error) { next(error); }
});

module.exports = router;
