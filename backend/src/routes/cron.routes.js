const crypto = require("crypto");
const router = require("express").Router();
const { runQuotationReminders } = require("../services/quotationReminder.service");
const { reconcilePending } = require("../services/merchantWallet.service");

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

// nTZS sends signed deposit events, but its payout lifecycle is read back by
// ID. This bounded sweep settles known pending records without ever resuming a
// provider request whose response ID was lost.
router.post("/merchant-wallet-reconcile", async (req, res, next) => {
  if (!authorized(req, "MERCHANT_WALLET_RECONCILE_CRON_SECRET")) return res.status(401).json({ error: "Unauthorized cron request" });
  try { res.json(await reconcilePending(100)); } catch (error) { next(error); }
});

module.exports = router;
