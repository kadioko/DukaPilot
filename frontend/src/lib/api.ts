import { t, type Lang } from "@/lib/i18n";
import { clearActiveOfflineSalesScope, hasPendingOfflineSales } from "@/lib/offlineSalesStorage";
import { clearActiveOfflineCropScope, hasPendingOfflineCropOperations } from "@/lib/offlineCropStorage";
import * as Sentry from "@sentry/nextjs";

const PROD_API_URL = "https://dukapilotproduction.up.railway.app/api";
const LOCAL_API_URL = "http://localhost:4000/api";
const BROWSER_API_PATH = "/_api";
const REQUEST_TIMEOUT_MS = 20000;
const API_DIAGNOSTIC_DEDUP_MS = 60_000;
export const BRANCH_KEY = "dukapilot_selected_branch";
export function selectedBranchId() { return typeof window === "undefined" ? "" : sessionStorage.getItem(BRANCH_KEY) || ""; }
export function switchBranch(id: string) {
  if (hasPendingOfflineSales()) throw new Error("Sync or resolve pending offline sales before switching branches.");
  if (hasPendingOfflineCropOperations()) throw new Error("Sync or resolve pending crop records before switching branches.");
  sessionStorage.setItem(BRANCH_KEY, id);
  invalidateCurrentSession();
  window.location.assign("/dashboard");
}

export interface ApiErrorDetail {
  row?: number;
  field?: string;
  message: string;
}

export type ApiFailureType = "NETWORK" | "TIMEOUT" | "HTTP" | "INVALID_RESPONSE";

export interface ApiRequestContext {
  endpoint: string;
  method: string;
  apiHostname: string;
  upstreamHostname?: string;
  transport: "same-origin-proxy" | "direct-api";
}

export class ApiError extends Error {
  status?: number;
  code?: string;
  details?: ApiErrorDetail[];
  failureType?: ApiFailureType;
  request?: ApiRequestContext;

  constructor(
    message: string,
    payload?: { code?: string; details?: ApiErrorDetail[] },
    status?: number,
    request?: ApiRequestContext,
    failureType?: ApiFailureType,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = payload?.code;
    this.details = payload?.details;
    this.request = request;
    this.failureType = failureType;
  }
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
}

function normalizeBaseUrl(url?: string): string {
  const normalized = String(url || "").trim().replace(/\n/g, "").replace(/\/$/, "");
  if (!normalized) return isProductionRuntime() ? PROD_API_URL : LOCAL_API_URL;
  const staleHost = ["dukaos", "production.up.railway.app"].join("-");
  if (normalized.includes(staleHost)) return PROD_API_URL;
  try {
    const parsed = new URL(normalized);
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    if (isProductionRuntime() && (isLocal || parsed.protocol !== "https:")) return PROD_API_URL;
    if (!isProductionRuntime() && parsed.protocol !== "https:" && !isLocal) return PROD_API_URL;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return isProductionRuntime() ? PROD_API_URL : LOCAL_API_URL;
  }
}

function getBaseUrl(): string {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return BROWSER_API_PATH;
  }

  if (process.env.NEXT_PUBLIC_API_URL) {
    return normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL);
  }

  return normalizeBaseUrl();
}

function requestContext(baseUrl: string, path: string, method: string): ApiRequestContext {
  const endpoint = path.split("?")[0] || "/";
  const browserOrigin = typeof window !== "undefined" ? window.location.origin : PROD_API_URL;
  try {
    const target = new URL(baseUrl, browserOrigin);
    const proxy = baseUrl === BROWSER_API_PATH;
    return {
      endpoint,
      method,
      apiHostname: target.hostname || "same-origin",
      ...(proxy ? { upstreamHostname: new URL(PROD_API_URL).hostname } : {}),
      transport: proxy ? "same-origin-proxy" : "direct-api",
    };
  } catch {
    return { endpoint, method, apiHostname: "invalid-url", transport: "direct-api" };
  }
}

const lastApiDiagnosticAt = new Map<string, number>();

function reportApiFailure(error: ApiError, context: ApiRequestContext) {
  const status = error.status;
  const failureType = error.failureType || "HTTP";
  const data = {
    endpoint: context.endpoint,
    method: context.method,
    apiHostname: context.apiHostname,
    upstreamHostname: context.upstreamHostname,
    transport: context.transport,
    status,
    networkErrorType: failureType === "NETWORK" ? "fetch-rejected" : undefined,
    timedOut: failureType === "TIMEOUT",
  };

  // Keep expected authorization/validation outcomes out of the error stream,
  // but leave a safe breadcrumb for any later error on the same session.
  Sentry.addBreadcrumb({ category: "api", level: status && status < 500 ? "info" : "error", message: `API ${context.method} ${context.endpoint} failed`, data });
  if (failureType === "HTTP" && status && status < 500) return;

  const key = `${failureType}:${status || "none"}:${context.method}:${context.endpoint}:${context.apiHostname}`;
  const now = Date.now();
  if ((lastApiDiagnosticAt.get(key) || 0) + API_DIAGNOSTIC_DEDUP_MS > now) return;
  lastApiDiagnosticAt.set(key, now);

  Sentry.withScope((scope) => {
    scope.setTag("api.endpoint", context.endpoint);
    scope.setTag("api.method", context.method);
    scope.setTag("api.hostname", context.apiHostname);
    scope.setTag("api.transport", context.transport);
    scope.setTag("api.failure_type", failureType);
    if (status) scope.setTag("api.status", String(status));
    scope.setContext("api_request", data);
    scope.setContext("client_connectivity", {
      online: typeof navigator === "undefined" ? undefined : navigator.onLine,
      language: typeof navigator === "undefined" ? undefined : navigator.language,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV || "unknown",
    });
    scope.setFingerprint(["api-request", failureType, context.method, context.endpoint, String(status || "none")]);
    Sentry.captureException(error);
  });
}

export function isNetworkError(error: unknown): error is ApiError {
  return error instanceof ApiError && (error.failureType === "NETWORK" || error.failureType === "TIMEOUT");
}

function isAbortError(cause: unknown) {
  return typeof cause === "object" && cause !== null && "name" in cause && cause.name === "AbortError";
}

export function getFriendlyErrorMessage(message: string, lang: Lang): string {
  const normalized = message.trim();

  if (normalized === "Invalid phone or PIN") {
    return t("auth.error.invalidCredentials", lang);
  }

  if (normalized === "No account found for this phone number") {
    return t("auth.error.accountNotFound", lang);
  }

  if (normalized === "Session expired") {
    return t("auth.error.sessionExpired", lang);
  }

  if (normalized.includes("Too many authentication attempts")) {
    return t("auth.error.rateLimited", lang);
  }

  if (normalized === "Unable to reach the DukaPilot server. Confirm the API URL is correct and the backend is online.") {
    return t("api.error.unavailable", lang);
  }

  if (normalized === "The request timed out. Please try again.") {
    return t("api.error.timeout", lang);
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

function getHttpErrorMessage(status: number, rawMessage: string, lang: Lang) {
  const knownMessage = getFriendlyErrorMessage(rawMessage, lang);
  if (knownMessage !== rawMessage) return knownMessage;
  if (status === 401) return t("auth.error.sessionExpired", lang);
  if (status === 403) return t("api.error.permissionDenied", lang);
  if (status === 404) return t("api.error.notFound", lang);
  if (status >= 500) return t("api.error.temporary", lang);
  return rawMessage;
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
      window.location.href = "/?notice=session-expired";
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
  const context = requestContext(baseUrl, path, options.method || "GET");
  if (["/auth/login", "/auth/logout", "/auth/register"].includes(path) && typeof window !== "undefined") {
    sessionStorage.removeItem(BRANCH_KEY);
    if (path === "/auth/login" || path === "/auth/register") {
      clearActiveOfflineSalesScope();
      clearActiveOfflineCropScope();
    }
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-DukaPilot-Language": lang,
    ...(selectedBranchId() ? { "X-DukaPilot-Branch": selectedBranchId() } : {}),
    ...(options.headers as Record<string, string>),
  };

  let res: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    res = await fetch(`${baseUrl}${path}`, { ...options, headers, credentials: "include", signal: controller.signal });
  } catch (cause) {
    const timedOut = isAbortError(cause);
    const error = new ApiError(
      timedOut ? t("api.error.timeout", lang) : t("api.error.unavailable", lang),
      undefined,
      undefined,
      context,
      timedOut ? "TIMEOUT" : "NETWORK",
    );
    reportApiFailure(error, context);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  // On 401, attempt token refresh once then retry
  // A failed sign-in is not an expired session. Read its response normally so
  // the login form can explain whether to retry a PIN or create an account.
  const canRefreshSession = path !== "/auth/login" && path !== "/auth/register";
  if (res.status === 401 && canRefreshSession && !_isRetry) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      return request<T>(path, options, lang, true);
    }
    handleAuthenticationFailure();
    const error = new ApiError(t("auth.error.sessionExpired", lang), undefined, 401, context, "HTTP");
    reportApiFailure(error, context);
    throw error;
  }

  if (res.status === 401 && canRefreshSession) {
    handleAuthenticationFailure();
    const error = new ApiError(t("auth.error.sessionExpired", lang), undefined, 401, context, "HTTP");
    reportApiFailure(error, context);
    throw error;
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const rawMessage =
      typeof payload === "string"
        ? payload || `Request failed with status ${res.status}`
        : payload?.error || `Request failed with status ${res.status}`;

    const error = new ApiError(getHttpErrorMessage(res.status, rawMessage, lang), typeof payload === "string" ? undefined : payload, res.status, context, "HTTP");
    reportApiFailure(error, context);
    throw error;
  }

  if (!isJson) {
    const error = new ApiError(t("auth.error.unexpectedResponse", lang), undefined, res.status, context, "INVALID_RESPONSE");
    reportApiFailure(error, context);
    throw error;
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, lang?: Lang) => request<T>(path, {}, lang),
  post: <T>(path: string, body: unknown, lang?: Lang) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }, lang),
  patch: <T>(path: string, body: unknown, lang?: Lang) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }, lang),
  put: <T>(path: string, body: unknown, lang?: Lang) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }, lang),
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

// Public pages may personalize optional content, but a missing session must
// never redirect a signed-out visitor away from the page.
export async function getOptionalCurrentSession<T>(): Promise<T | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/auth/me`, { credentials: "include", headers: { "X-DukaPilot-Language": "en" } });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

export function invalidateCurrentSession() {
  currentSessionCache = null;
  currentSessionRequest = null;
}

export async function downloadFile(path: string, filename: string, lang: Lang = "en") {
  const headers: Record<string, string> = selectedBranchId() ? { "X-DukaPilot-Branch": selectedBranchId() } : {};

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
    clearActiveOfflineSalesScope();
    sessionStorage.removeItem(BRANCH_KEY);
    localStorage.removeItem(SESSION_HINT_KEY);
    localStorage.removeItem("dukapilot_token");
    localStorage.removeItem("dukaos_token");
  }
}

export function formatTZS(amount: number): string {
  return `TZS ${Number(amount).toLocaleString("en-TZ")}`;
}
