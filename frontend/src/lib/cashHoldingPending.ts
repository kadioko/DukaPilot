export type PendingCashHolding = {
  path: "/cash-holding/count" | "/cash-holding/movements";
  body: Record<string, unknown> & { requestKey: string };
};

const PREFIX = "dukapilot_cash_holding_pending:";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function key(scope: string) { return PREFIX + encodeURIComponent(scope); }

export function readPendingCashHolding(scope: string): PendingCashHolding | "invalid" | "unavailable" | null {
  try {
    const raw = sessionStorage.getItem(key(scope));
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as PendingCashHolding;
      if (!value || !["/cash-holding/count", "/cash-holding/movements"].includes(value.path) || !value.body || typeof value.body.requestKey !== "string" || !UUID.test(value.body.requestKey)) return "invalid";
      return value;
    } catch { return "invalid"; }
  } catch { return "unavailable"; }
}

export function savePendingCashHolding(scope: string, pending: PendingCashHolding): boolean {
  try { sessionStorage.setItem(key(scope), JSON.stringify(pending)); return true; } catch { return false; }
}

export function clearPendingCashHolding(scope: string): boolean {
  try { sessionStorage.removeItem(key(scope)); return true; } catch { return false; }
}
