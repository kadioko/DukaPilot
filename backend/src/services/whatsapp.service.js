/**
 * WhatsApp Order Message Service
 *
 * Generates ready-to-send WhatsApp messages for supplier orders.
 * These can be opened directly via the WhatsApp deep link (wa.me)
 * or sent programmatically via WhatsApp Business API / Twilio.
 */

function buildWhatsAppOrderMessage(order, shop) {
  const date = new Date(order.createdAt).toLocaleDateString("sw-TZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const itemLines = order.items
    .map((item) => {
      const name = item.product?.name || `Product #${item.productId.slice(-6)}`;
      const unit = item.product?.unit || "pcs";
      return `  • ${name}: *${item.quantity} ${unit}*`;
    })
    .join("\n");

  const total = order.totalAmount ? formatTZS(order.totalAmount) : "TBD";

  const message = [
    `🛒 *AGIZO JIPYA - ${shop.name}*`,
    `📅 Tarehe: ${date}`,
    `🔢 Nambari ya Agizo: #${order.id.slice(-8).toUpperCase()}`,
    ``,
    `*Bidhaa Zilizoagizwa:*`,
    itemLines,
    ``,
    `💰 Jumla ya Thamani: ${total}`,
    order.note ? `📝 Maelezo: ${order.note}` : null,
    ``,
    `📍 Mahali pa Biashara: ${shop.location}${shop.district ? `, ${shop.district}` : ""}`,
    ``,
    `Tafadhali thibitisha agizo hili. Asante! 🙏`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const encodedMessage = encodeURIComponent(message);
  const supplierPhone = order.supplier?.phone?.replace(/\D/g, "");
  const whatsappUrl = supplierPhone
    ? `https://wa.me/${supplierPhone}?text=${encodedMessage}`
    : null;

  return { message, whatsappUrl, supplierPhone: order.supplier?.phone };
}

function formatTZS(amount) {
  return `TZS ${Number(amount).toLocaleString("en-TZ")}`;
}

function normalizeWhatsAppPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 10) return `255${digits.slice(1)}`;
  return digits;
}

function cloudApiConfig() {
  const apiUrl = String(process.env.WHATSAPP_API_URL || "").trim().replace(/\/$/, "");
  const token = String(process.env.WHATSAPP_API_TOKEN || "").trim();
  const phoneId = String(process.env.WHATSAPP_PHONE_ID || "").trim();
  return { apiUrl, token, phoneId, configured: Boolean(apiUrl && token && phoneId) };
}

async function postCloudMessage(payload) {
  const { apiUrl, token, phoneId, configured } = cloudApiConfig();
  if (!configured) return { sent: false, reason: "WhatsApp API not configured" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response;
  try {
    response = await fetch(`${apiUrl}/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp API error (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const data = await response.json();
  return { sent: true, data, messageId: data.messages?.[0]?.id || null, provider: "META_WHATSAPP" };
}

function isWhatsAppOtpConfigured() {
  return Boolean(cloudApiConfig().configured && String(process.env.WHATSAPP_OTP_TEMPLATE || "").trim());
}

function isWhatsAppFreeformEnabled() {
  return String(process.env.WHATSAPP_ENABLE_FREEFORM || "").trim().toLowerCase() === "true";
}

// PIN recovery starts with an approved Meta template. This works outside the
// 24-hour customer-service window and never logs the code.
async function sendWhatsAppOtp(phone, code) {
  const templateName = String(process.env.WHATSAPP_OTP_TEMPLATE || "").trim();
  const language = String(process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE || "en_US").trim();
  if (!isWhatsAppOtpConfigured()) {
    throw new Error("WhatsApp PIN recovery is not configured. Set WHATSAPP_OTP_TEMPLATE after Meta approves it.");
  }

  return postCloudMessage({
    to: normalizeWhatsAppPhone(phone),
    type: "template",
    template: {
      name: templateName,
      language: { policy: "deterministic", code: language },
      components: [{ type: "body", parameters: [{ type: "text", text: String(code) }] }],
    },
  });
}

/**
 * Send order via WhatsApp Business Cloud API
 * Requires WHATSAPP_API_TOKEN and WHATSAPP_PHONE_ID env vars
 */
async function sendWhatsAppMessage(toPhone, message) {
  if (!isWhatsAppFreeformEnabled()) {
    return { sent: false, reason: "WhatsApp free-form messaging is disabled" };
  }
  return postCloudMessage({
    to: normalizeWhatsAppPhone(toPhone),
    type: "text",
    text: { body: message },
  });
}

function buildCustomerOrderMessage(order, shop) {
  const date = new Date(order.createdAt).toLocaleDateString("sw-TZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const itemLines = order.items
    .map((item) => {
      const name = item.product?.name || `Bidhaa #${item.productId.slice(-6)}`;
      const unit = item.product?.unit || "pcs";
      const tier = item.pricingTier === "WHOLESALE" ? " (Jumla)" : "";
      return `  • ${name}: *${item.quantity} ${unit}*${tier} — ${formatTZS(item.unitPrice * item.quantity)}`;
    })
    .join("\n");

  const message = [
    `🛒 *AGIZO JIPYA — ${shop.name}*`,
    `📅 Tarehe: ${date}`,
    `🔢 Nambari: #${order.id.slice(-8).toUpperCase()}`,
    ``,
    `👤 Mteja: *${order.customerName}*`,
    `📱 Simu: ${order.customerPhone}`,
    ``,
    `*Bidhaa Zilizoombwa:*`,
    itemLines,
    ``,
    `💰 Jumla: *${formatTZS(order.totalAmount)}*`,
    order.note ? `📝 Maelezo: ${order.note}` : null,
    ``,
    `Tafadhali wasiliana na mteja kuthibitisha agizo. 🙏`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const shopPhone = shop.user?.phone?.replace(/\D/g, "") || shop.phone?.replace(/\D/g, "");
  const whatsappUrl = shopPhone ? `https://wa.me/${shopPhone}?text=${encodeURIComponent(message)}` : null;

  return { message, whatsappUrl };
}

module.exports = {
  buildWhatsAppOrderMessage,
  buildCustomerOrderMessage,
  sendWhatsAppMessage,
  sendWhatsAppOtp,
  isWhatsAppOtpConfigured,
  isWhatsAppFreeformEnabled,
  normalizeWhatsAppPhone,
  formatTZS,
};
