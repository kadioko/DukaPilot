const PENDING_CROP_OPERATIONS_KEY = "dukapilot_pending_crop_operations";
const ACTIVE_CROP_SCOPE_KEY = "dukapilot_active_crop_scope";

export type PendingCropOperation = {
  id: string;
  path: string;
  method?: "POST" | "PATCH";
  label?: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string;
  needsAttention?: boolean;
};

function key(scope: string) { return `${PENDING_CROP_OPERATIONS_KEY}:${scope}`; }

export function newCropOperationId() {
  const suffix = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Date.now()}${Math.random().toString(36).slice(2)}`;
  return `crop_${suffix}`;
}

export function readPendingCropOperations(scope: string): PendingCropOperation[] {
  if (typeof window === "undefined" || !scope) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key(scope)) || "[]");
    return Array.isArray(parsed)
      ? parsed
          .filter((item) => item && typeof item.id === "string" && typeof item.path === "string" && item.payload && typeof item.payload === "object")
          .map((item) => ({
            ...item,
            method: item.method === "PATCH" ? "PATCH" : "POST",
            label: typeof item.label === "string" ? item.label : "Crop record",
            attempts: Math.max(0, Number(item.attempts) || 0),
            needsAttention: item.needsAttention === true,
          }))
      : [];
  } catch { return []; }
}

export function writePendingCropOperations(scope: string, operations: PendingCropOperation[]) {
  if (typeof window === "undefined" || !scope) return;
  window.localStorage.setItem(key(scope), JSON.stringify(operations.slice(-100)));
}

export function setActiveOfflineCropScope(scope: string | null) {
  if (typeof window === "undefined") return;
  if (scope) window.localStorage.setItem(ACTIVE_CROP_SCOPE_KEY, scope);
  else window.localStorage.removeItem(ACTIVE_CROP_SCOPE_KEY);
}

export function clearActiveOfflineCropScope() { setActiveOfflineCropScope(null); }

export function hasPendingOfflineCropOperations() {
  if (typeof window === "undefined") return false;
  try {
    const scope = window.localStorage.getItem(ACTIVE_CROP_SCOPE_KEY);
    return Boolean(scope && readPendingCropOperations(scope).length);
  } catch { return true; }
}
