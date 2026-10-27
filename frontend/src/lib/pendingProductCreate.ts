export const PENDING_PRODUCT_CREATE_PREFIX = "dukapilot_pending_product_create_v1";

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PendingProductCreate<TForm, TBody extends { createRequestId: string }> {
  requestId: string;
  form: TForm;
  body: TBody;
  savedAt: number;
}

type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getSessionStore(): SessionStore | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function storageKey(scope: string) {
  return `${PENDING_PRODUCT_CREATE_PREFIX}:${encodeURIComponent(scope)}`;
}

export function savePendingProductCreate<TForm, TBody extends { createRequestId: string }>(
  scope: string,
  pending: PendingProductCreate<TForm, TBody>,
  store: SessionStore | null = getSessionStore(),
): boolean {
  if (!store || !scope || !REQUEST_ID_PATTERN.test(pending.requestId) || pending.body.createRequestId !== pending.requestId) return false;
  try {
    store.setItem(storageKey(scope), JSON.stringify({ version: 1, ...pending }));
    return true;
  } catch {
    return false;
  }
}

export function loadPendingProductCreate<TForm, TBody extends { createRequestId: string }>(
  scope: string,
  store: SessionStore | null = getSessionStore(),
): PendingProductCreate<TForm, TBody> | null {
  if (!store || !scope) return null;
  const key = storageKey(scope);
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingProductCreate<TForm, TBody>> & { version?: number };
    if (
      parsed.version !== 1
      || typeof parsed.requestId !== "string"
      || !REQUEST_ID_PATTERN.test(parsed.requestId)
      || !parsed.form || typeof parsed.form !== "object"
      || !parsed.body || typeof parsed.body !== "object"
      || parsed.body.createRequestId !== parsed.requestId
      || typeof parsed.savedAt !== "number"
    ) {
      store.removeItem(key);
      return null;
    }
    return {
      requestId: parsed.requestId,
      form: parsed.form,
      body: parsed.body,
      savedAt: parsed.savedAt,
    };
  } catch {
    try { store.removeItem(key); } catch { /* Storage may be unavailable. */ }
    return null;
  }
}

export function clearPendingProductCreate(scope: string, store: SessionStore | null = getSessionStore()) {
  if (!store || !scope) return;
  try { store.removeItem(storageKey(scope)); } catch { /* Storage may be unavailable. */ }
}
