type PendingFarmRequest = { id: string; fingerprint: string };

function fingerprint(value: unknown) {
  const text = JSON.stringify(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16)}${(second >>> 0).toString(16)}`;
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `farm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function getFarmRequestId(action: string, payload: unknown) {
  const storageKey = `dukapilot:farm-request:${action}`;
  const nextFingerprint = fingerprint(payload);
  try {
    const current = sessionStorage.getItem(storageKey);
    if (current) {
      const pending = JSON.parse(current) as PendingFarmRequest;
      if (pending.fingerprint === nextFingerprint && pending.id) return pending.id;
    }
    const pending = { id: newId(), fingerprint: nextFingerprint };
    sessionStorage.setItem(storageKey, JSON.stringify(pending));
    return pending.id;
  } catch {
    return newId();
  }
}

export function clearFarmRequestId(action: string, requestId: string) {
  try {
    const storageKey = `dukapilot:farm-request:${action}`;
    const pending = JSON.parse(sessionStorage.getItem(storageKey) || "null") as PendingFarmRequest | null;
    if (pending?.id === requestId) sessionStorage.removeItem(storageKey);
  } catch {
    // The successful server response remains authoritative if browser storage is unavailable.
  }
}
