function graphApiUrl() {
  return String(process.env.META_GRAPH_API_URL || "https://graph.facebook.com/v25.0").trim().replace(/\/$/, "");
}

function config() {
  const appId = String(process.env.META_APP_ID || "").trim();
  const appSecret = String(process.env.META_APP_SECRET || "").trim();
  return { appId, appSecret, ready: Boolean(appId && appSecret), graphApiUrl: graphApiUrl() };
}

function safeGraphError(response, fallback) {
  if (response.status === 401 || response.status === 403) return "Meta did not authorize the connection. Complete approval in WhatsApp Business and try again.";
  return fallback;
}

async function fetchJson(url, options, fallback) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(safeGraphError(response, fallback));
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function exchangeCode(code) {
  const settings = config();
  if (!settings.ready) throw new Error("Meta coexistence is not configured on the server");

  const url = new URL(`${settings.graphApiUrl}/oauth/access_token`);
  url.searchParams.set("client_id", settings.appId);
  url.searchParams.set("client_secret", settings.appSecret);
  url.searchParams.set("code", code);
  const payload = await fetchJson(url, { method: "GET" }, "Meta could not complete the secure connection");
  if (!payload?.access_token) throw new Error("Meta did not return an authorization token");
  return String(payload.access_token);
}

async function findCoexistingPhone(wabaId, accessToken) {
  const settings = config();
  const url = new URL(`${settings.graphApiUrl}/${encodeURIComponent(wabaId)}/phone_numbers`);
  url.searchParams.set("fields", "id,display_phone_number,verified_name,is_on_biz_app,platform_type");
  const payload = await fetchJson(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  }, "Meta could not verify the connected WhatsApp number");
  const phones = Array.isArray(payload?.data) ? payload.data : [];
  return phones.find((phone) => phone?.is_on_biz_app === true && String(phone?.platform_type || "").toUpperCase() === "CLOUD_API") || null;
}

async function verifyCoexistenceOnboarding({ code, wabaId }) {
  const normalizedCode = String(code || "").trim();
  const normalizedWabaId = String(wabaId || "").trim();
  if (normalizedCode.length < 12 || normalizedCode.length > 4096) throw new Error("A valid Meta authorization code is required");
  if (!/^\d{5,32}$/.test(normalizedWabaId)) throw new Error("A valid WhatsApp Business Account ID is required");

  const accessToken = await exchangeCode(normalizedCode);
  const phone = await findCoexistingPhone(normalizedWabaId, accessToken);
  if (!phone) {
    return {
      connected: false,
      message: "Meta has not confirmed a Cloud API coexistence phone yet. Finish the approval in WhatsApp Business, then start the connection again.",
    };
  }

  return {
    connected: true,
    wabaId: normalizedWabaId,
    phoneNumberId: String(phone.id),
    displayPhoneNumber: String(phone.display_phone_number || ""),
    verifiedName: String(phone.verified_name || ""),
    isOnBusinessApp: true,
    platformType: "CLOUD_API",
  };
}

function isCoexistenceConfigured() {
  return config().ready;
}

module.exports = { verifyCoexistenceOnboarding, isCoexistenceConfigured };
