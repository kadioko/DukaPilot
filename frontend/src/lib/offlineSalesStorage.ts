const PENDING_SALES_KEY = "dukapilot_pending_sales";
const SYNC_HISTORY_KEY = "dukapilot_sales_sync_history";
const ACTIVE_SCOPE_KEY = "dukapilot_active_sales_scope";

type SessionIdentity = {
  id: string;
  businessShopId?: string;
  shop?: { id?: string; parentShopId?: string | null };
  staff?: { id?: string };
};

function safeScopePart(value: string | undefined, fallback: string) {
  return String(value || fallback).replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function offlineSalesScope(user: SessionIdentity) {
  const businessId = user.businessShopId || user.shop?.parentShopId || user.shop?.id;
  return [
    safeScopePart(businessId, "business"),
    safeScopePart(user.shop?.id, "main"),
    safeScopePart(user.staff?.id || user.id, "actor"),
  ].join("_");
}

export function scopedOfflineKey(base: "pending" | "history", scope: string) {
  return `${base === "pending" ? PENDING_SALES_KEY : SYNC_HISTORY_KEY}:${scope}`;
}

export function setActiveOfflineSalesScope(scope: string | null) {
  if (typeof window === "undefined") return;
  if (scope) window.localStorage.setItem(ACTIVE_SCOPE_KEY, scope);
  else window.localStorage.removeItem(ACTIVE_SCOPE_KEY);
}

export function hasPendingOfflineSales() {
  if (typeof window === "undefined") return false;
  try {
    const activeScope = window.localStorage.getItem(ACTIVE_SCOPE_KEY);
    const scoped = activeScope ? JSON.parse(window.localStorage.getItem(scopedOfflineKey("pending", activeScope)) || "[]") : [];
    const legacy = JSON.parse(window.localStorage.getItem(PENDING_SALES_KEY) || "[]");
    return (Array.isArray(scoped) && scoped.length > 0) || (Array.isArray(legacy) && legacy.length > 0);
  } catch {
    return true;
  }
}

export function legacyPendingOfflineSalesCount() {
  if (typeof window === "undefined") return 0;
  try {
    const pending = JSON.parse(window.localStorage.getItem(PENDING_SALES_KEY) || "[]");
    return Array.isArray(pending) ? pending.length : 0;
  } catch {
    return 0;
  }
}

export function clearActiveOfflineSalesScope() {
  setActiveOfflineSalesScope(null);
}
