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

function receive(req, res) {
  if (!hasValidSignature(req)) {
    return res.status(401).json({ error: "Invalid Meta WhatsApp webhook signature" });
  }

  // Delivery-status persistence is added with the outbound template sender.
  // Do not log message bodies, phone numbers, PINs, or webhook payloads.
  res.sendStatus(200);
}

module.exports = { verify, receive, hasValidSignature, safeEqual };
