const STORAGE_KEY = "dukapilot_cash_session_open_pending";
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PENDING_AGE_MS = 24 * 60 * 60 * 1000;

export interface PendingCashSessionOpen {
  clientRequestId: string;
  openingCash: number;
  note: string | null;
  branchId: string;
  savedAt: number;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function readPendingCashSessionOpen(branchId: string): PendingCashSessionOpen | null {
  const currentStorage = storage();
  if (!currentStorage) return null;
  try {
    const raw = currentStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingCashSessionOpen>;
    const valid = typeof value.clientRequestId === "string" && REQUEST_ID_PATTERN.test(value.clientRequestId)
      && Number.isSafeInteger(value.openingCash) && Number(value.openingCash) >= 0
      && (value.note === null || typeof value.note === "string")
      && typeof value.branchId === "string" && typeof value.savedAt === "number";
    if (!valid || value.branchId !== branchId || Date.now() - value.savedAt! > MAX_PENDING_AGE_MS || value.savedAt! > Date.now()) {
      currentStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return value as PendingCashSessionOpen;
  } catch {
    try { currentStorage.removeItem(STORAGE_KEY); } catch { /* Ignore storage failures. */ }
    return null;
  }
}

export function savePendingCashSessionOpen(value: PendingCashSessionOpen): boolean {
  const currentStorage = storage();
  if (!currentStorage) return false;
  try {
    currentStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingCashSessionOpen(): void {
  const currentStorage = storage();
  if (!currentStorage) return;
  try { currentStorage.removeItem(STORAGE_KEY); } catch { /* Ignore storage failures. */ }
}
