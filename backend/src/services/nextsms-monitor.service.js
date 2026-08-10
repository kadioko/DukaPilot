const DEFAULT_NEXTSMS_MONITOR_BASE_URL = "https://messaging-service.co.tz/api/v2";
const CACHE_TTL_MS = 15_000;

let cachedSnapshot = null;
let cachedAt = 0;

function monitorBaseUrl() {
  return String(process.env.NEXTSMS_MONITOR_BASE_URL || DEFAULT_NEXTSMS_MONITOR_BASE_URL).replace(/\/$/, "");
}

function isNextSmsMonitoringConfigured() {
  const configured = String(process.env.SMS_PROVIDER || "").trim().toUpperCase();
  return (configured === "NEXTSMS" || (!configured && Boolean(process.env.NEXTSMS_API_KEY)))
    && Boolean(process.env.NEXTSMS_API_KEY);
}

function maskPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "Unknown recipient";
  return `${digits.length > 4 ? `${"*".repeat(Math.max(0, digits.length - 4))}` : ""}${digits.slice(-4)}`;
}

async function providerGet(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${monitorBaseUrl()}/${path}`, {
      headers: {
        Authorization: `Bearer ${process.env.NEXTSMS_API_KEY}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    if (!response.ok) throw new Error(`NextSMS monitoring API error (${response.status})`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeReport(report) {
  const status = report?.status || {};
  return {
    messageId: String(report?.messageId || ""),
    reference: String(report?.reference || ""),
    to: maskPhone(report?.to),
    sender: String(report?.from || ""),
    channel: String(report?.channel || ""),
    smsCount: Number(report?.smsCount) || 0,
    status: String(report?.delivery || status.groupName || status.name || "UNKNOWN").toUpperCase(),
    sentAt: report?.sentAt || null,
    doneAt: report?.doneAt || null,
  };
}

async function getNextSmsMonitoring({ force = false } = {}) {
  if (!isNextSmsMonitoringConfigured()) {
    const error = new Error("NextSMS monitoring is not configured");
    error.status = 503;
    throw error;
  }
  if (!force && cachedSnapshot && Date.now() - cachedAt < CACHE_TTL_MS) return cachedSnapshot;

  const [balance, reportsResponse] = await Promise.all([providerGet("balance"), providerGet("reports")]);
  const reports = Array.isArray(reportsResponse?.results) ? reportsResponse.results.slice(0, 100).map(normalizeReport) : [];
  const summary = reports.reduce((totals, report) => {
    totals.total += 1;
    if (report.status === "DELIVERED") totals.delivered += 1;
    else if (["FAILED", "REJECTED", "UNDELIVERABLE", "EXPIRED"].includes(report.status)) totals.failed += 1;
    else totals.pending += 1;
    return totals;
  }, { total: 0, delivered: 0, failed: 0, pending: 0 });

  cachedSnapshot = {
    provider: "NEXTSMS",
    fetchedAt: new Date().toISOString(),
    balance: {
      smsCredits: Number(balance?.default_balance) || 0,
      balanceTzs: Number(balance?.sms_balance) || 0,
      display: String(balance?.display || ""),
      channel: String(balance?.default || ""),
    },
    summary,
    reports,
  };
  cachedAt = Date.now();
  return cachedSnapshot;
}

function clearNextSmsMonitoringCache() {
  cachedSnapshot = null;
  cachedAt = 0;
}

module.exports = { getNextSmsMonitoring, isNextSmsMonitoringConfigured, maskPhone, clearNextSmsMonitoringCache };
