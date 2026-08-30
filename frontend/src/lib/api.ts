import { t, type Lang } from "@/lib/i18n";

const PROD_API_URL = "https://dukapilotproduction.up.railway.app/api";
const BROWSER_API_PATH = "/_api";
const REQUEST_TIMEOUT_MS = 20000;

export interface ApiErrorDetail {
  row?: number;
  field?: string;
  message: string;
}

export class ApiError extends Error {
  code?: string;
  details?: ApiErrorDetail[];

  constructor(message: string, payload?: { code?: string; details?: ApiErrorDetail[] }) {
    super(message);
    this.name = "ApiError";
    this.code = payload?.code;
    this.details = payload?.details;
  }
}

function normalizeBaseUrl(url: string): string {
  const normalized = url.trim().replace(/\n/g, "").replace(/\/$/, "");
  const staleHost = ["dukaos", "production.up.railway.app"].join("-");
  return normalized.includes(staleHost) ? PROD_API_URL : normalized;
}

function getBaseUrl(): string {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return BROWSER_API_PATH;
  }

  if (process.env.NEXT_PUBLIC_API_URL) {
    return normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL);
  }

  return normalizeBaseUrl("http://localhost:4000/api");
}

export function getFriendlyErrorMessage(message: string, lang: Lang): string {
  const normalized = message.trim();

  if (normalized === "Invalid phone or PIN") {
    return t("auth.error.invalidCredentials", lang);
  }

  if (normalized === "Session expired") {
    return t("auth.error.sessionExpired", lang);
  }

  if (normalized.includes("Too many authentication attempts")) {
    return t("auth.error.rateLimited", lang);
  }

  if (normalized === "Unable to reach the DukaPilot server. Confirm the API URL is correct and the backend is online.") {
    return t("auth.error.serverOffline", lang);
  }

  if (normalized === "The DukaPilot server returned an unexpected response format.") {
    return t("auth.error.unexpectedResponse", lang);
  }

  if (normalized === "Subscription required" || normalized === "SUBSCRIPTION_REQUIRED") {
    return t("billing.subscriptionRequired", lang);
  }

  if (normalized === "Pro plan required" || normalized === "PLAN_UPGRADE_REQUIRED" || normalized.includes("requires DukaPilot Pro")) {
    return lang === "sw" ? "Sehemu hii inahitaji mpango wa DukaPilot Pro." : "This feature requires the DukaPilot Pro plan.";
  }

  return normalized;
}

let refreshingPromise: Promise<boolean> | null = null;
let authFailureHandled = false;
const SESSION_HINT_KEY = "dukapilot_session_active";
let currentSessionCache: { value: unknown; expiresAt: number } | null = null;
let currentSessionRequest: Promise<unknown> | null = null;

function handleAuthenticationFailure() {
  if (typeof window !== "undefined" && !authFailureHandled) {
    authFailureHandled = true;
    window.localStorage.removeItem(SESSION_HINT_KEY);
    if (window.location.pathname !== "/") {
      window.location.href = "/";
    }
  }
}

async function tryRefreshToken(): Promise<boolean> {
  if (refreshingPromise) return refreshingPromise;

  refreshingPromise = (async () => {
    try {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return false;
      return true;
    } catch {
      return false;
    } finally {
      refreshingPromise = null;
    }
  })();

  return refreshingPromise;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  lang: Lang = "en",
  _isRetry = false
): Promise<T> {
  const baseUrl = getBaseUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-DukaPilot-Language": lang,
    ...(options.headers as Record<string, string>),
  };

  let res: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    res = await fetch(`${baseUrl}${path}`, { ...options, headers, credentials: "include", signal: controller.signal });
  } catch {
    throw new Error("Unable to reach the DukaPilot server. Confirm the API URL is correct and the backend is online.");
  } finally {
    clearTimeout(timeoutId);
  }

  // On 401, attempt token refresh once then retry
  if (res.status === 401 && !_isRetry) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return request<T>(path, options, lang, true);
    }
    handleAuthenticationFailure();
    throw new Error("Session expired");
  }

  if (res.status === 401) {
    handleAuthenticationFailure();
    throw new Error("Session expired");
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const rawMessage =
      typeof payload === "string"
        ? payload || `Request failed with status ${res.status}`
        : payload?.error || `Request failed with status ${res.status}`;

    throw new ApiError(getFriendlyErrorMessage(rawMessage, lang), typeof payload === "string" ? undefined : payload);
  }

  if (!isJson) {
    throw new Error("The DukaPilot server returned an unexpected response format.");
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, lang?: Lang) => request<T>(path, {}, lang),
  post: <T>(path: string, body: unknown, lang?: Lang) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, lang),
  patch: <T>(path: string, body: unknown, lang?: Lang) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }, lang),
  delete: <T>(path: string, lang?: Lang) => request<T>(path, { method: "DELETE" }, lang),
};

// AppShell and route pages often mount together. Coalesce the same session
// lookup so navigation does not create a fan-out of /auth/me requests.
export async function getCurrentSession<T>(): Promise<T> {
  if (currentSessionCache && currentSessionCache.expiresAt > Date.now()) return currentSessionCache.value as T;
  if (currentSessionRequest) return currentSessionRequest as Promise<T>;
  currentSessionRequest = api.get<T>("/auth/me")
    .then((value) => {
      currentSessionCache = { value, expiresAt: Date.now() + 30_000 };
      return value;
    })
    .finally(() => { currentSessionRequest = null; });
  return currentSessionRequest as Promise<T>;
}

export function invalidateCurrentSession() {
  currentSessionCache = null;
  currentSessionRequest = null;
}

export async function downloadFile(path: string, filename: string, lang: Lang = "en") {
  const headers: Record<string, string> = {};

  const res = await fetch(`${getBaseUrl()}${path}`, { headers, credentials: "include" });
  if (!res.ok) {
    const payload = await res.text();
    throw new Error(getFriendlyErrorMessage(payload || `Request failed with status ${res.status}`, lang));
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function setToken(_token?: string) {
  authFailureHandled = false;
  // Kept as a compatibility no-op for older callers. Authentication lives in
  // Secure, HttpOnly cookies and no access token is stored in browser script.
}

export function markSessionActive() {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SESSION_HINT_KEY, "1");
  }
  authFailureHandled = false;
}

export function hasSessionHint(): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(SESSION_HINT_KEY) === "1";
}

export function clearToken() {
  invalidateCurrentSession();
  if (typeof window !== "undefined") {
    localStorage.removeItem(SESSION_HINT_KEY);
    localStorage.removeItem("dukapilot_token");
    localStorage.removeItem("dukaos_token");
  }
}

export function formatTZS(amount: number): string {
  return `TZS ${Number(amount).toLocaleString("en-TZ")}`;
}
