const crypto = require("crypto");

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function configuredVerifyToken() {
  return String(process.env.META_WHATSAPP_VERIFY_TOKEN || "").trim();
}

function verify(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const expectedToken = configuredVerifyToken();

  if (!expectedToken) {
    return res.status(503).json({ error: "Meta WhatsApp webhook is not configured" });
  }

  if (mode === "subscribe" && challenge && safeEqual(token, expectedToken)) {
    return res.status(200).type("text/plain").send(String(challenge));
  }

  return res.status(403).json({ error: "Webhook verification failed" });
}

function hasValidSignature(req) {
  const appSecret = String(process.env.META_WHATSAPP_APP_SECRET || "").trim();
  const signature = String(req.get("x-hub-signature-256") || "");
  if (!appSecret || !signature.startsWith("sha256=") || !Buffer.isBuffer(req.rawBody)) return false;

  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(req.rawBody).digest("hex")}`;
  return safeEqual(signature, expected);
}

function hasCoexistenceUpdate(payload) {
  const coexistenceFields = new Set(["history", "smb_app_state_sync", "smb_message_echoes"]);
  return Array.isArray(payload?.entry) && payload.entry.some((entry) =>
    Array.isArray(entry?.changes) && entry.changes.some((change) => coexistenceFields.has(change?.field))
  );
}

function receive(req, res) {
  if (!hasValidSignature(req)) {
    return res.status(401).json({ error: "Invalid Meta WhatsApp webhook signature" });
  }

  // Coexistence fields (history, smb_app_state_sync, smb_message_echoes) are
  // accepted here after Meta subscription. Do not log message bodies, phone
  // numbers, PINs, authorization codes, or the raw webhook payload.
  if (hasCoexistenceUpdate(req.body)) return res.sendStatus(200);
  res.sendStatus(200);
}

module.exports = { verify, receive, hasValidSignature, safeEqual, hasCoexistenceUpdate };
