import { t, type Lang } from "@/lib/i18n";

const LEGACY_PROD_API_URL = "https://dukaos-production.up.railway.app/api";
const PROD_API_URL = "https://dukapilotproduction.up.railway.app/api";
const TOKEN_KEY = "dukapilot_token";
const LEGACY_TOKEN_KEY = "dukaos_token";
const REQUEST_TIMEOUT_MS = 20000;

function normalizeBaseUrl(url: string): string {
  const normalized = url.trim().replace(/\n/g, "").replace(/\/$/, "");
  return normalized === LEGACY_PROD_API_URL ? PROD_API_URL : normalized;
}

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL);
  }

  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return normalizeBaseUrl(PROD_API_URL);
  }

  return normalizeBaseUrl("http://localhost:4000/api");
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
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

  return normalized;
}

let refreshingPromise: Promise<boolean> | null = null;

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
      const data = await res.json();
      if (data?.token) {
        setToken(data.token);
        return true;
      }
      return false;
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
  const token = getToken();
  const baseUrl = getBaseUrl();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

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
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/";
    throw new Error("Session expired");
  }

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") window.location.href = "/";
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

    throw new Error(getFriendlyErrorMessage(rawMessage, lang));
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

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function formatTZS(amount: number): string {
  return `TZS ${Number(amount).toLocaleString("en-TZ")}`;
}
