const crypto = require("crypto");
const router = require("express").Router();
const { runQuotationReminders } = require("../services/quotationReminder.service");

function authorized(req) {
  const secret = process.env.QUOTATION_REMINDER_CRON_SECRET;
  const supplied = String(req.get("X-Cron-Secret") || req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!secret || !supplied) return false;
  const expected = Buffer.from(secret); const received = Buffer.from(supplied);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

router.post("/quotation-reminders", async (req, res, next) => {
  if (!authorized(req)) return res.status(401).json({ error: "Unauthorized cron request" });
  try { res.json(await runQuotationReminders()); } catch (error) { next(error); }
});

module.exports = router;
