type Attribution = {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  sessionId: string;
};

const ATTRIBUTION_KEY = "dukapilot_marketing_attribution";
const SESSION_KEY = "dukapilot_marketing_session";
const REFERRAL_CODE_KEY = "dukapilot_referral_code";
const MAX_VALUE_LENGTH = 120;

function clean(value: string | null): string | null {
  const trimmed = value?.trim().slice(0, MAX_VALUE_LENGTH) || "";
  return trimmed || null;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  const existing = window.sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const sessionId = crypto.randomUUID();
  window.sessionStorage.setItem(SESSION_KEY, sessionId);
  return sessionId;
}

export function captureAttribution(): Attribution {
  if (typeof window === "undefined") return { source: null, medium: null, campaign: null, content: null, sessionId: "" };

  const params = new URLSearchParams(window.location.search);
  let referrerSource: string | null = null;
  try {
    referrerSource = document.referrer ? clean(new URL(document.referrer).hostname) : null;
  } catch {
    referrerSource = null;
  }
  const incoming = {
    source: clean(params.get("utm_source")) || referrerSource,
    medium: clean(params.get("utm_medium")),
    campaign: clean(params.get("utm_campaign")),
    content: clean(params.get("utm_content")),
  };
  const saved = window.localStorage.getItem(ATTRIBUTION_KEY);
  let previous: Partial<Attribution> | null = null;
  try {
    previous = saved ? JSON.parse(saved) : null;
  } catch {
    window.localStorage.removeItem(ATTRIBUTION_KEY);
  }
  const attribution = {
    source: incoming.source || previous?.source || "direct",
    medium: incoming.medium || previous?.medium || null,
    campaign: incoming.campaign || previous?.campaign || null,
    content: incoming.content || previous?.content || null,
    sessionId: getSessionId(),
  };
  window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
  return attribution;
}

export function getAttribution(): Attribution {
  return captureAttribution();
}

export function captureReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  const incoming = clean(new URLSearchParams(window.location.search).get("ref"))?.toUpperCase() || null;
  if (incoming && /^DP-[A-Z0-9-]{8,80}$/.test(incoming)) {
    window.localStorage.setItem(REFERRAL_CODE_KEY, incoming);
    return incoming;
  }

  const saved = clean(window.localStorage.getItem(REFERRAL_CODE_KEY))?.toUpperCase() || null;
  return saved && /^DP-[A-Z0-9-]{8,80}$/.test(saved) ? saved : null;
}

export function getReferralCode(): string | null {
  return captureReferralCode();
}

export function clearReferralCode() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(REFERRAL_CODE_KEY);
  }
}

export type MarketingEventName = "store_click" | "signup_started" | "trial_started" | "whatsapp_started";

export function trackMarketingEvent(eventName: MarketingEventName) {
  if (typeof window === "undefined") return;
  const attribution = captureAttribution();
  fetch("/_api/public/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      eventName,
      sessionId: attribution.sessionId,
      product: "dukapilot_web",
      source: attribution.source,
      campaign: attribution.campaign,
    }),
  }).catch(() => {});
}
